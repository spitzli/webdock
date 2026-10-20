//! Separately privileged fixed-size filesystems, retaining the existing pool/volume identity format.
use chrono::{DateTime, Utc};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{File, OpenOptions},
    io::{Read, Write},
    os::unix::fs::{FileTypeExt, MetadataExt, OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use webdock_core::id::RecordId;
use webdock_supervisor::{ExecutionError, Result};
pub mod database;
const MIN: u64 = 67_108_864;
const MAX: u64 = 1_099_511_627_776;
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StorageConfig {
    pub root: PathBuf,
    pub node: String,
    #[serde(rename = "clusterID")]
    pub cluster_id: RecordId,
    #[serde(rename = "poolID")]
    pub pool_id: String,
    pub capacity_bytes: u64,
    pub reserve_bytes: u64,
}
impl StorageConfig {
    pub fn validate(&self) -> Result<()> {
        if !self.root.is_absolute()
            || self.root.as_os_str().len() > 2048
            || self.node.is_empty()
            || self.node.len() > 253
            || !self.node.as_bytes()[0].is_ascii_alphanumeric()
            || !self
                .node
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-')
            || !valid_uuid(&self.pool_id)
            || !(MIN..=MAX).contains(&self.capacity_bytes)
            || !(MIN..=MAX).contains(&self.reserve_bytes)
        {
            return Err(ExecutionError::Invalid("storage configuration"));
        }
        Ok(())
    }
    pub fn load(path: &Path) -> Result<Self> {
        require_root()?;
        let config: Self = read_json(path, 65536)?;
        config.validate()?;
        private(&config.root, true)?;
        Ok(config)
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StorageSpec {
    pub volume_bytes: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StoragePacket {
    #[serde(rename = "appID")]
    pub app_id: RecordId,
    #[serde(rename = "projectID")]
    pub project_id: RecordId,
    #[serde(rename = "clusterID")]
    pub cluster_id: RecordId,
    pub revision: u64,
    pub lease_until: DateTime<Utc>,
    pub spec: StorageSpec,
}
impl StoragePacket {
    pub fn new(
        app: &str,
        project: &str,
        cluster: &str,
        revision: u64,
        bytes: u64,
        lease_until: u64,
    ) -> Result<Self> {
        let packet = Self {
            app_id: RecordId::parse(app).map_err(|_| ExecutionError::Invalid("storage app"))?,
            project_id: RecordId::parse(project)
                .map_err(|_| ExecutionError::Invalid("storage project"))?,
            cluster_id: RecordId::parse(cluster)
                .map_err(|_| ExecutionError::Invalid("storage cluster"))?,
            revision,
            lease_until: DateTime::from_timestamp(
                i64::try_from(lease_until).map_err(|_| ExecutionError::Expired)?,
                0,
            )
            .ok_or(ExecutionError::Expired)?,
            spec: StorageSpec {
                volume_bytes: bytes,
            },
        };
        packet.validate()?;
        Ok(packet)
    }
    pub fn validate(&self) -> Result<()> {
        if self.revision == 0
            || self.revision > 9_007_199_254_740_991
            || !(MIN..=MAX).contains(&self.spec.volume_bytes)
        {
            return Err(ExecutionError::Invalid("storage packet"));
        }
        if self.lease_until <= Utc::now() {
            return Err(ExecutionError::Expired);
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VolumeState {
    Initializing,
    Ready,
    Purging,
    Purged,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VolumeRecord {
    #[serde(rename = "appID")]
    pub app_id: RecordId,
    #[serde(rename = "projectID")]
    pub project_id: RecordId,
    #[serde(rename = "clusterID")]
    pub cluster_id: RecordId,
    pub bytes: u64,
    pub uuid: String,
    pub state: VolumeState,
}
impl VolumeRecord {
    fn validate(&self) -> Result<()> {
        if !(MIN..=MAX).contains(&self.bytes) || !valid_uuid(&self.uuid) {
            return Err(ExecutionError::Invalid("volume record"));
        }
        Ok(())
    }
    pub fn authorize(&self, packet: &StoragePacket) -> Result<()> {
        self.validate()?;
        if self.app_id != packet.app_id
            || self.project_id != packet.project_id
            || self.cluster_id != packet.cluster_id
            || self.bytes != packet.spec.volume_bytes
        {
            return Err(ExecutionError::Ownership);
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PoolState {
    #[serde(rename = "poolID")]
    pool_id: String,
    volumes: BTreeMap<String, VolumeRecord>,
}
#[derive(Clone)]
pub struct StorageGuard {
    deadline: DateTime<Utc>,
    cancelled: Arc<AtomicBool>,
}
impl StorageGuard {
    pub fn new(deadline: DateTime<Utc>, cancelled: Arc<AtomicBool>) -> Self {
        Self {
            deadline,
            cancelled,
        }
    }
    pub fn check(&self) -> Result<()> {
        if self.cancelled.load(Ordering::SeqCst) || self.deadline <= Utc::now() {
            Err(ExecutionError::Expired)
        } else {
            Ok(())
        }
    }
    fn maintenance() -> Self {
        Self::new(
            Utc::now() + chrono::Duration::seconds(300),
            Arc::new(AtomicBool::new(false)),
        )
    }
}
fn valid_uuid(value: &str) -> bool {
    uuid::Uuid::parse_str(value).is_ok_and(|v| v.hyphenated().to_string() == value)
}
fn require_root() -> Result<()> {
    if rustix::process::geteuid().as_raw() != 0 {
        return Err(ExecutionError::Denied);
    }
    Ok(())
}
fn io<T>(result: std::io::Result<T>) -> Result<T> {
    result.map_err(|error| {
        tracing::debug!(%error, "Storage filesystem operation failed");
        ExecutionError::Runtime
    })
}
fn private(path: &Path, directory: bool) -> Result<()> {
    let meta = io(std::fs::symlink_metadata(path))?;
    if !path.is_absolute()
        || io(std::fs::canonicalize(path))? != path
        || meta.uid() != 0
        || meta.mode() & 0o077 != 0
        || (directory && !meta.is_dir())
        || (!directory && (!meta.is_file() || meta.nlink() != 1))
    {
        return Err(ExecutionError::Ownership);
    }
    Ok(())
}
fn read_json<T: serde::de::DeserializeOwned>(path: &Path, limit: u64) -> Result<T> {
    private(path, false)?;
    let file = io(OpenOptions::new()
        .read(true)
        .custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32)
        .open(path))?;
    let mut bytes = Vec::new();
    io(file.take(limit + 1).read_to_end(&mut bytes))?;
    if bytes.len() as u64 > limit {
        return Err(ExecutionError::Invalid("storage metadata limit"));
    }
    serde_json::from_slice(&bytes).map_err(|_| ExecutionError::Invalid("storage metadata"))
}
fn sync_directory(path: &Path) -> Result<()> {
    io(io(File::open(path))?.sync_all())
}
fn write_state(directory: &Path, state: &PoolState) -> Result<()> {
    private(directory, true)?;
    let bytes = serde_json::to_vec(state).map_err(|_| ExecutionError::Runtime)?;
    if bytes.len() > 64 * 1024 * 1024 {
        return Err(ExecutionError::Invalid("storage metadata limit"));
    }
    let mut file = io(tempfile::NamedTempFile::new_in(directory))?;
    io(file.write_all(&bytes))?;
    io(file.as_file().sync_all())?;
    file.persist(directory.join("state.json"))
        .map_err(|_| ExecutionError::Runtime)?;
    sync_directory(directory)
}
fn mkdir(path: &Path) -> Result<()> {
    use std::os::unix::fs::DirBuilderExt;
    io(std::fs::DirBuilder::new().mode(0o700).create(path))
}
struct Output {
    code: i32,
    stdout: String,
}
fn run(program: &str, args: &[&str], guard: &StorageGuard, seconds: u64) -> Result<Output> {
    guard.check()?;
    let mut child = io(Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn())?;
    let stdout = child.stdout.take().ok_or(ExecutionError::Runtime)?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let deadline = Instant::now() + Duration::from_secs(seconds);
    let status = loop {
        if guard.check().is_err() || Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            return Err(ExecutionError::Expired);
        }
        if let Some(status) = io(child.try_wait())? {
            break status;
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    let bytes = reader
        .join()
        .map_err(|_| ExecutionError::Runtime)?
        .map_err(|_| ExecutionError::Runtime)?;
    if bytes.len() > 1024 * 1024 {
        return Err(ExecutionError::Runtime);
    }
    Ok(Output {
        code: status.code().ok_or(ExecutionError::Runtime)?,
        stdout: String::from_utf8(bytes)
            .map_err(|_| ExecutionError::Runtime)?
            .trim()
            .into(),
    })
}
fn checked(program: &str, args: &[&str], guard: &StorageGuard, seconds: u64) -> Result<String> {
    let output = run(program, args, guard, seconds)?;
    if output.code != 0 {
        tracing::warn!(
            program,
            exit_code = output.code,
            "Storage helper command failed"
        );
        return Err(ExecutionError::Runtime);
    }
    Ok(output.stdout)
}
fn path_str(path: &Path) -> Result<&str> {
    path.to_str().ok_or(ExecutionError::Invalid("storage path"))
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StorageKind {
    Apps,
    Database,
}
impl StorageKind {
    fn uid(self) -> u32 {
        match self {
            Self::Apps => 65532,
            Self::Database => 26,
        }
    }
}
pub struct StoragePool {
    kind: StorageKind,
    config: StorageConfig,
    config_path: PathBuf,
    _lock: File,
    poisoned: bool,
}
impl StoragePool {
    pub fn initialize(config_path: &Path) -> Result<()> {
        let config = StorageConfig::load(config_path)?;
        if io(std::fs::read_dir(&config.root))?.next().is_some() {
            return Err(ExecutionError::Conflict);
        }
        let pool = config.root.join("_pool");
        mkdir(&pool)?;
        write_state(
            &pool,
            &PoolState {
                pool_id: config.pool_id,
                volumes: BTreeMap::new(),
            },
        )?;
        sync_directory(&config.root)
    }
    pub fn open(config_path: &Path) -> Result<Self> {
        Self::open_kind(config_path, StorageKind::Apps)
    }
    pub fn open_kind(config_path: &Path, kind: StorageKind) -> Result<Self> {
        let config = StorageConfig::load(config_path)?;
        let pool = config.root.join("_pool");
        private(&pool, true)?;
        let lock = io(OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32)
            .open(pool.join("service.lock")))?;
        private(&pool.join("service.lock"), false)?;
        lock.try_lock_exclusive()
            .map_err(|_| ExecutionError::Conflict)?;
        let instance = Self {
            kind,
            config,
            config_path: config_path.into(),
            _lock: lock,
            poisoned: false,
        };
        instance.state()?;
        let marker = pool.join("service-kind.json");
        if marker.try_exists().map_err(|_| ExecutionError::Runtime)? {
            if read_json::<StorageKind>(&marker, 64)? != kind {
                return Err(ExecutionError::Ownership);
            }
        } else {
            // Validate migrated ready filesystems before binding this pool to a service.
            for record in instance.state()?.volumes.values() {
                if record.state == VolumeState::Ready {
                    instance.mount_record(
                        &instance.config.root.join(record.app_id.as_str()),
                        record,
                        &StorageGuard::maintenance(),
                    )?;
                }
            }
            let mut file = io(tempfile::NamedTempFile::new_in(&pool))?;
            io(file.write_all(&serde_json::to_vec(&kind).map_err(|_| ExecutionError::Runtime)?))?;
            io(file.as_file().sync_all())?;
            file.persist_noclobber(marker)
                .map_err(|_| ExecutionError::Conflict)?;
            sync_directory(&pool)?;
        }
        Ok(instance)
    }
    pub fn configuration(&self) -> &StorageConfig {
        &self.config
    }
    fn state(&self) -> Result<PoolState> {
        if self.poisoned {
            return Err(ExecutionError::Journal);
        }
        if StorageConfig::load(&self.config_path)? != self.config {
            return Err(ExecutionError::Conflict);
        }
        let state: PoolState =
            read_json(&self.config.root.join("_pool/state.json"), 64 * 1024 * 1024)?;
        if state.pool_id != self.config.pool_id {
            return Err(ExecutionError::Ownership);
        }
        for (key, record) in &state.volumes {
            record.validate()?;
            if key != record.app_id.as_str()
                || record.cluster_id != self.config.cluster_id
                || (self.kind == StorageKind::Database && record.app_id != record.project_id)
            {
                return Err(ExecutionError::Ownership);
            }
        }
        for entry in io(std::fs::read_dir(&self.config.root))? {
            let entry = io(entry)?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| ExecutionError::Ownership)?;
            if name != "_pool" && !state.volumes.contains_key(&name) {
                return Err(ExecutionError::Ownership);
            }
        }
        Ok(state)
    }
    fn record(&self, app: &RecordId) -> Result<Option<VolumeRecord>> {
        Ok(self.state()?.volumes.get(app.as_str()).cloned())
    }
    fn persist(&mut self, record: VolumeRecord) -> Result<()> {
        let mut state = self.state()?;
        state.volumes.insert(record.app_id.to_string(), record);
        if write_state(&self.config.root.join("_pool"), &state).is_err() {
            self.poisoned = true;
            return Err(ExecutionError::Journal);
        }
        Ok(())
    }
    fn mounted(&self, directory: &Path, guard: &StorageGuard) -> Result<bool> {
        let target = directory.join("mount");
        if std::fs::symlink_metadata(&target).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err(ExecutionError::Ownership);
        }
        let output = run(
            "/usr/bin/findmnt",
            &[
                "--json",
                "--mountpoint",
                path_str(&target)?,
                "-o",
                "SOURCE,TARGET,FSTYPE",
            ],
            guard,
            10,
        )?;
        if output.code == 1 {
            return Ok(false);
        }
        if output.code != 0 {
            return Err(ExecutionError::Runtime);
        }
        let value: serde_json::Value =
            serde_json::from_str(&output.stdout).map_err(|_| ExecutionError::Runtime)?;
        let mounts = value["filesystems"]
            .as_array()
            .ok_or(ExecutionError::Runtime)?;
        if mounts.len() != 1 || mounts[0]["fstype"] != "ext4" {
            return Err(ExecutionError::Ownership);
        }
        let source = mounts[0]["source"]
            .as_str()
            .ok_or(ExecutionError::Ownership)?;
        if !source
            .strip_prefix("/dev/loop")
            .is_some_and(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
        {
            return Err(ExecutionError::Ownership);
        }
        let loops = checked(
            "/usr/sbin/losetup",
            &["--json", "--list", "--output", "NAME,BACK-FILE", source],
            guard,
            10,
        )?;
        let loops: serde_json::Value =
            serde_json::from_str(&loops).map_err(|_| ExecutionError::Runtime)?;
        let loops = loops["loopdevices"]
            .as_array()
            .ok_or(ExecutionError::Runtime)?;
        if loops.len() != 1 || loops[0]["back-file"] != path_str(&directory.join("volume.ext4"))? {
            return Err(ExecutionError::Ownership);
        }
        Ok(true)
    }
    fn image(
        &self,
        directory: &Path,
        record: &VolumeRecord,
        guard: &StorageGuard,
    ) -> Result<PathBuf> {
        let image = directory.join("volume.ext4");
        private(&image, false)?;
        if io(std::fs::metadata(&image))?.len() != record.bytes {
            return Err(ExecutionError::Ownership);
        }
        let uuid = checked(
            "/usr/sbin/blkid",
            &["-p", "-s", "UUID", "-o", "value", path_str(&image)?],
            guard,
            10,
        )?;
        if uuid != record.uuid {
            return Err(ExecutionError::Ownership);
        }
        Ok(image)
    }
    fn mount_record(
        &self,
        directory: &Path,
        record: &VolumeRecord,
        guard: &StorageGuard,
    ) -> Result<PathBuf> {
        if record.state != VolumeState::Ready {
            return Err(ExecutionError::Conflict);
        }
        private(directory, true)?;
        let image = self.image(directory, record, guard)?;
        if !self.mounted(directory, guard)? {
            let target = directory.join("mount");
            match std::fs::symlink_metadata(&target) {
                Ok(meta) => {
                    if !meta.is_dir() || io(std::fs::read_dir(&target))?.next().is_some() {
                        return Err(ExecutionError::Ownership);
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => mkdir(&target)?,
                Err(_) => return Err(ExecutionError::Runtime),
            };
            checked(
                "/usr/bin/mount",
                &[
                    "-t",
                    "ext4",
                    "-o",
                    "loop,nodev,nosuid,noexec",
                    path_str(&image)?,
                    path_str(&target)?,
                ],
                guard,
                45,
            )?;
        }
        if !self.mounted(directory, guard)? {
            return Err(ExecutionError::Runtime);
        }
        let data = directory.join("mount/data");
        let metadata = io(std::fs::symlink_metadata(&data))?;
        if !metadata.is_dir()
            || io(std::fs::canonicalize(&data))? != data
            || metadata.uid() != self.kind.uid()
            || metadata.gid() != self.kind.uid()
        {
            return Err(ExecutionError::Ownership);
        }
        Ok(data)
    }
    pub fn ensure(
        &mut self,
        packet: &StoragePacket,
        guard: &StorageGuard,
    ) -> Result<(StorageConfig, PathBuf)> {
        packet.validate()?;
        guard.check()?;
        if packet.cluster_id != self.config.cluster_id
            || (self.kind == StorageKind::Database && packet.app_id != packet.project_id)
        {
            return Err(ExecutionError::Ownership);
        }
        let directory = self.config.root.join(packet.app_id.as_str());
        if let Some(record) = self.record(&packet.app_id)? {
            record.authorize(packet)?;
            return Ok((
                self.config.clone(),
                self.mount_record(&directory, &record, guard)?,
            ));
        }
        if packet.revision != 1 {
            return Err(ExecutionError::Ownership);
        }
        let used = self
            .state()?
            .volumes
            .values()
            .filter(|r| r.state != VolumeState::Purged)
            .try_fold(0u64, |total, r| total.checked_add(r.bytes))
            .ok_or(ExecutionError::Runtime)?;
        let available =
            rustix::fs::statvfs(&self.config.root).map_err(|_| ExecutionError::Runtime)?;
        let free = available
            .f_bavail
            .checked_mul(available.f_frsize)
            .ok_or(ExecutionError::Runtime)?;
        if used
            .checked_add(packet.spec.volume_bytes)
            .is_none_or(|total| total > self.config.capacity_bytes)
            || free < packet.spec.volume_bytes + self.config.reserve_bytes
        {
            return Err(ExecutionError::Runtime);
        }
        let mut record = VolumeRecord {
            app_id: packet.app_id.clone(),
            project_id: packet.project_id.clone(),
            cluster_id: packet.cluster_id.clone(),
            bytes: packet.spec.volume_bytes,
            uuid: uuid::Uuid::new_v4().hyphenated().to_string(),
            state: VolumeState::Initializing,
        };
        self.persist(record.clone())?;
        guard.check()?;
        mkdir(&directory)?;
        let image = directory.join("volume.ext4");
        let file = io(OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .mode(0o600)
            .custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32)
            .open(&image))?;
        guard.check()?;
        rustix::fs::fallocate(&file, rustix::fs::FallocateFlags::empty(), 0, record.bytes)
            .map_err(|_| ExecutionError::Runtime)?;
        io(file.sync_all())?;
        drop(file);
        checked(
            "/usr/sbin/mkfs.ext4",
            &[
                "-q",
                "-m",
                "0",
                "-U",
                &record.uuid,
                "-E",
                "nodiscard,lazy_itable_init=0,lazy_journal_init=0",
                path_str(&image)?,
            ],
            guard,
            45,
        )?;
        let target = directory.join("mount");
        guard.check()?;
        mkdir(&target)?;
        checked(
            "/usr/bin/mount",
            &[
                "-t",
                "ext4",
                "-o",
                "loop,nodev,nosuid,noexec",
                path_str(&image)?,
                path_str(&target)?,
            ],
            guard,
            45,
        )?;
        if !self.mounted(&directory, guard)? {
            return Err(ExecutionError::Runtime);
        }
        let data = target.join("data");
        guard.check()?;
        mkdir(&data)?;
        io(std::fs::set_permissions(
            &data,
            std::fs::Permissions::from_mode(0o770),
        ))?;
        io(std::os::unix::fs::chown(
            &data,
            Some(self.kind.uid()),
            Some(self.kind.uid()),
        ))?;
        checked("/usr/bin/sync", &["-f", path_str(&target)?], guard, 45)?;
        sync_directory(&directory)?;
        sync_directory(&self.config.root)?;
        guard.check()?;
        record.state = VolumeState::Ready;
        self.persist(record.clone())?;
        Ok((
            self.config.clone(),
            self.mount_record(&directory, &record, guard)?,
        ))
    }
    pub fn retained(&self, packet: &StoragePacket) -> Result<()> {
        packet.validate()?;
        if packet.cluster_id != self.config.cluster_id
            || (self.kind == StorageKind::Database && packet.app_id != packet.project_id)
        {
            return Err(ExecutionError::Ownership);
        }
        if let Some(record) = self.record(&packet.app_id)? {
            record.authorize(packet)?;
        }
        Ok(())
    }
    /// Inspect an existing allocation without mounting, repairing, or deleting anything.
    pub fn volume_state(
        &self,
        packet: &StoragePacket,
        guard: &StorageGuard,
    ) -> Result<VolumeState> {
        self.retained(packet)?;
        guard.check()?;
        let record = self
            .record(&packet.app_id)?
            .ok_or(ExecutionError::Ownership)?;
        record.authorize(packet)?;
        let directory = self.config.root.join(packet.app_id.as_str());
        private(&directory, true)?;
        match record.state {
            VolumeState::Ready => {
                self.image(&directory, &record, guard)?;
                if !self.mounted(&directory, guard)? {
                    return Err(ExecutionError::Ownership);
                }
                let data = io(std::fs::symlink_metadata(directory.join("mount/data")))?;
                if !data.is_dir() || data.uid() != self.kind.uid() || data.gid() != self.kind.uid()
                {
                    return Err(ExecutionError::Ownership);
                }
            }
            VolumeState::Purged => {
                if io(std::fs::read_dir(&directory))?.next().is_some() {
                    return Err(ExecutionError::Ownership);
                }
            }
            VolumeState::Initializing | VolumeState::Purging => {
                return Err(ExecutionError::Conflict);
            }
        }
        guard.check()?;
        Ok(record.state)
    }
    pub fn purge(&mut self, packet: &StoragePacket, guard: &StorageGuard) -> Result<()> {
        self.retained(packet)?;
        guard.check()?;
        let Some(mut record) = self.record(&packet.app_id)? else {
            return Ok(());
        };
        if record.state == VolumeState::Purged {
            return Ok(());
        }
        let directory = self.config.root.join(packet.app_id.as_str());
        private(&directory, true)?;
        for entry in io(std::fs::read_dir(&directory))? {
            let name = io(entry)?.file_name();
            if name != "volume.ext4" && name != "mount" {
                return Err(ExecutionError::Ownership);
            }
        }
        let image = directory.join("volume.ext4");
        if record.state == VolumeState::Ready {
            self.image(&directory, &record, guard)?;
        }
        if std::fs::symlink_metadata(&image).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err(ExecutionError::Ownership);
        }
        if record.state != VolumeState::Purging {
            record.state = VolumeState::Purging;
            self.persist(record.clone())?;
        }
        if self.mounted(&directory, guard)? {
            checked(
                "/usr/bin/umount",
                &[path_str(&directory.join("mount"))?],
                guard,
                45,
            )?;
        }
        if image.try_exists().map_err(|_| ExecutionError::Runtime)? {
            private(&image, false)?;
            let output = checked(
                "/usr/sbin/losetup",
                &["--json", "--list", "--associated", path_str(&image)?],
                guard,
                10,
            )?;
            let loops: serde_json::Value =
                serde_json::from_str(&output).map_err(|_| ExecutionError::Runtime)?;
            if !loops["loopdevices"]
                .as_array()
                .ok_or(ExecutionError::Runtime)?
                .is_empty()
            {
                return Err(ExecutionError::Conflict);
            }
            guard.check()?;
            io(std::fs::remove_file(&image))?;
        }
        let target = directory.join("mount");
        if target.try_exists().map_err(|_| ExecutionError::Runtime)? {
            io(std::fs::remove_dir(&target))?;
        }
        sync_directory(&directory)?;
        guard.check()?;
        record.state = VolumeState::Purged;
        self.persist(record)
    }
    pub fn restore(&self) -> Result<()> {
        let guard = StorageGuard::maintenance();
        for record in self.state()?.volumes.values() {
            if record.state == VolumeState::Ready
                && self
                    .mount_record(
                        &self.config.root.join(record.app_id.as_str()),
                        record,
                        &guard,
                    )
                    .is_err()
            {
                tracing::warn!(app_id=%record.app_id,"Retained volume needs reconciliation");
            }
        }
        Ok(())
    }
    pub fn capability(&self, nodes: &[String]) -> Result<u64> {
        if nodes != [self.config.node.clone()] {
            return Err(ExecutionError::Ownership);
        }
        let guard = StorageGuard::maintenance();
        for record in self.state()?.volumes.values() {
            if !matches!(record.state, VolumeState::Ready | VolumeState::Purged) {
                return Err(ExecutionError::Journal);
            }
            if record.state == VolumeState::Ready {
                let directory = self.config.root.join(record.app_id.as_str());
                self.image(&directory, record, &guard)?;
                if !self.mounted(&directory, &guard)? {
                    return Err(ExecutionError::Runtime);
                }
            }
        }
        Ok(self.config.capacity_bytes)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RpcRequest {
    action: String,
    value: serde_json::Value,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct RpcResponse {
    ok: bool,
    value: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StorageCapability {
    pub capacity_bytes: u64,
    pub ready: bool,
}
fn dispatch(
    pool: &mut StoragePool,
    request: RpcRequest,
    cancelled: Arc<AtomicBool>,
) -> Result<serde_json::Value> {
    if pool.kind == StorageKind::Database {
        return database::dispatch(pool, request, cancelled);
    }
    match request.action.as_str() {
        "info" => {
            if !request.value.is_null() {
                return Err(ExecutionError::Invalid("storage info"));
            }
            pool.state()?;
            serde_json::to_value(pool.configuration()).map_err(|_| ExecutionError::Runtime)
        }
        "capability" => {
            let nodes: Vec<String> = serde_json::from_value(request.value)
                .map_err(|_| ExecutionError::Invalid("storage nodes"))?;
            if nodes.len() > 200 || nodes.iter().any(|n| n.len() > 253) {
                return Err(ExecutionError::Invalid("storage nodes"));
            }
            let capacity = pool.capability(&nodes);
            Ok(
                serde_json::json!({"capacityBytes":capacity.as_ref().copied().unwrap_or(0),"ready":capacity.is_ok()}),
            )
        }
        "ensure" | "retained" | "purge" | "state" => {
            let packet: StoragePacket = serde_json::from_value(request.value)
                .map_err(|_| ExecutionError::Invalid("storage packet"))?;
            packet.validate()?;
            let guard = StorageGuard::new(packet.lease_until, cancelled);
            match request.action.as_str() {
                "ensure" => serde_json::to_value(pool.ensure(&packet, &guard)?)
                    .map_err(|_| ExecutionError::Runtime),
                "retained" => {
                    pool.retained(&packet)?;
                    Ok(serde_json::Value::Null)
                }
                "purge" => {
                    pool.purge(&packet, &guard)?;
                    Ok(serde_json::Value::Null)
                }
                "state" => serde_json::to_value(pool.volume_state(&packet, &guard)?)
                    .map_err(|_| ExecutionError::Runtime),
                _ => unreachable!(),
            }
        }
        _ => Err(ExecutionError::Unsupported("storage action")),
    }
}
async fn connection(
    stream: tokio::net::UnixStream,
    pool: Arc<std::sync::Mutex<StoragePool>>,
    shutdown: Arc<AtomicBool>,
) -> Result<()> {
    use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt};
    if stream
        .peer_cred()
        .map_err(|_| ExecutionError::Denied)?
        .uid()
        != 0
    {
        return Err(ExecutionError::Denied);
    }
    let (read, mut write) = stream.into_split();
    let mut reader = tokio::io::BufReader::new(read);
    let mut bytes = Vec::new();
    tokio::time::timeout(
        Duration::from_secs(10),
        (&mut reader).take(4097).read_until(b'\n', &mut bytes),
    )
    .await
    .map_err(|_| ExecutionError::Expired)?
    .map_err(|_| ExecutionError::Runtime)?;
    if bytes.len() > 4096 || !bytes.ends_with(b"\n") {
        return Err(ExecutionError::Invalid("storage frame"));
    }
    let request: RpcRequest =
        serde_json::from_slice(&bytes).map_err(|_| ExecutionError::Invalid("storage request"))?;
    if shutdown.load(Ordering::SeqCst) {
        return Err(ExecutionError::Expired);
    }
    let cancelled = Arc::new(AtomicBool::new(false));
    let work_cancel = cancelled.clone();
    let mut worker = tokio::task::spawn_blocking(move || {
        let mut pool = pool.lock().map_err(|_| ExecutionError::Journal)?;
        dispatch(&mut pool, request, work_cancel)
    });
    let mut extra = [0u8; 1];
    let result = loop {
        tokio::select! {
            result=&mut worker=>break result.map_err(|_|ExecutionError::Runtime)?,
            _=reader.read(&mut extra)=>{cancelled.store(true,Ordering::SeqCst);let _=worker.await;return Err(ExecutionError::Expired);},
            _=tokio::time::sleep(Duration::from_millis(50))=>if shutdown.load(Ordering::SeqCst){cancelled.store(true,Ordering::SeqCst);let _=worker.await;return Err(ExecutionError::Expired);},
        }
    };
    let response = match result {
        Ok(value) => RpcResponse {
            ok: true,
            value,
            error: None,
        },
        Err(ExecutionError::Unsupported(_)) => RpcResponse {
            ok: false,
            value: serde_json::Value::Null,
            error: Some("not_supported".into()),
        },
        Err(error) => {
            tracing::debug!(%error, "Storage request refused");
            RpcResponse {
                ok: false,
                value: serde_json::Value::Null,
                error: None,
            }
        }
    };
    let mut bytes = serde_json::to_vec(&response).map_err(|_| ExecutionError::Runtime)?;
    bytes.push(b'\n');
    if bytes.len() > 8192 {
        return Err(ExecutionError::Runtime);
    }
    tokio::time::timeout(Duration::from_secs(10), write.write_all(&bytes))
        .await
        .map_err(|_| ExecutionError::Expired)?
        .map_err(|_| ExecutionError::Runtime)
}
struct SocketOwner {
    path: PathBuf,
    inode: u64,
    device: u64,
}
impl Drop for SocketOwner {
    fn drop(&mut self) {
        if let Ok(meta) = std::fs::symlink_metadata(&self.path)
            && meta.ino() == self.inode
            && meta.dev() == self.device
            && meta.file_type().is_socket()
        {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}
/// Root-only Unix RPC, compatible with existing app storage clients. Never opens a TCP listener.
pub async fn serve(
    config_path: &Path,
    socket_path: &Path,
    shutdown: impl std::future::Future<Output = ()>,
) -> Result<()> {
    serve_kind(config_path, socket_path, StorageKind::Apps, shutdown).await
}
pub async fn serve_kind(
    config_path: &Path,
    socket_path: &Path,
    kind: StorageKind,
    shutdown: impl std::future::Future<Output = ()>,
) -> Result<()> {
    use std::os::unix::fs::FileTypeExt;
    require_root()?;
    let pool = StoragePool::open_kind(config_path, kind)?;
    pool.restore()?;
    private(
        socket_path
            .parent()
            .ok_or(ExecutionError::Invalid("storage socket"))?,
        true,
    )?;
    match std::fs::symlink_metadata(socket_path) {
        Ok(meta) => {
            if !meta.file_type().is_socket() || meta.uid() != 0 || meta.mode() & 0o077 != 0 {
                return Err(ExecutionError::Ownership);
            }
            match tokio::net::UnixStream::connect(socket_path).await {
                Ok(_) => return Err(ExecutionError::Conflict),
                Err(error) if error.kind() == std::io::ErrorKind::ConnectionRefused => {}
                Err(_) => return Err(ExecutionError::Conflict),
            }
            let current = io(std::fs::symlink_metadata(socket_path))?;
            if current.ino() != meta.ino() || current.dev() != meta.dev() {
                return Err(ExecutionError::Conflict);
            }
            io(std::fs::remove_file(socket_path))?;
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err(ExecutionError::Runtime),
    }
    let listener = io(tokio::net::UnixListener::bind(socket_path))?;
    io(std::fs::set_permissions(
        socket_path,
        std::fs::Permissions::from_mode(0o600),
    ))?;
    let meta = io(std::fs::symlink_metadata(socket_path))?;
    let _socket = SocketOwner {
        path: socket_path.into(),
        inode: meta.ino(),
        device: meta.dev(),
    };
    let pool = Arc::new(std::sync::Mutex::new(pool));
    let stopping = Arc::new(AtomicBool::new(false));
    let permits = Arc::new(tokio::sync::Semaphore::new(8));
    let mut handlers = tokio::task::JoinSet::new();
    tokio::pin!(shutdown);
    loop {
        tokio::select! {
            _=&mut shutdown=>break,
            accepted=listener.accept()=>{
                let (stream,_)=accepted.map_err(|_|ExecutionError::Runtime)?;
                let Ok(permit)=permits.clone().try_acquire_owned() else{drop(stream);continue};let pool=pool.clone();let stop=stopping.clone();handlers.spawn(async move{let _permit=permit;let _=connection(stream,pool,stop).await;});
            },
            _=handlers.join_next(),if !handlers.is_empty()=>{},
        }
    }
    stopping.store(true, Ordering::SeqCst);
    drop(listener);
    while handlers.join_next().await.is_some() {}
    Ok(())
}
#[derive(Clone)]
pub struct StorageClient {
    socket: PathBuf,
}
impl StorageClient {
    pub fn new(socket: PathBuf) -> Self {
        Self { socket }
    }
    async fn call<T: serde::de::DeserializeOwned>(
        &self,
        action: &str,
        value: serde_json::Value,
    ) -> Result<T> {
        use std::os::unix::fs::FileTypeExt;
        use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt};
        private(self.socket.parent().ok_or(ExecutionError::Ownership)?, true)?;
        let meta = io(std::fs::symlink_metadata(&self.socket))?;
        if !meta.file_type().is_socket() || meta.uid() != 0 || meta.mode() & 0o077 != 0 {
            return Err(ExecutionError::Ownership);
        }
        let mut request = serde_json::to_vec(&serde_json::json!({"action":action,"value":value}))
            .map_err(|_| ExecutionError::Invalid("storage request"))?;
        request.push(b'\n');
        if request.len() > 4096 {
            return Err(ExecutionError::Invalid("storage frame"));
        }
        let work = async {
            let mut stream = tokio::net::UnixStream::connect(&self.socket)
                .await
                .map_err(|_| ExecutionError::Runtime)?;
            if stream
                .peer_cred()
                .map_err(|_| ExecutionError::Denied)?
                .uid()
                != 0
            {
                return Err(ExecutionError::Denied);
            }
            stream
                .write_all(&request)
                .await
                .map_err(|_| ExecutionError::Runtime)?;
            let mut reader = tokio::io::BufReader::new(stream).take(8193);
            let mut bytes = Vec::new();
            reader
                .read_until(b'\n', &mut bytes)
                .await
                .map_err(|_| ExecutionError::Runtime)?;
            if bytes.len() > 8192 || !bytes.ends_with(b"\n") {
                return Err(ExecutionError::Invalid("storage response"));
            }
            let response: RpcResponse = serde_json::from_slice(&bytes)
                .map_err(|_| ExecutionError::Invalid("storage response"))?;
            if !response.ok {
                return Err(if response.error.as_deref() == Some("not_supported") {
                    ExecutionError::Unsupported("storage RPC")
                } else {
                    ExecutionError::Runtime
                });
            }
            serde_json::from_value(response.value)
                .map_err(|_| ExecutionError::Invalid("storage response"))
        };
        tokio::time::timeout(Duration::from_secs(100), work)
            .await
            .map_err(|_| ExecutionError::Expired)?
    }
    pub async fn information(&self) -> Result<StorageConfig> {
        let config: StorageConfig = self.call("info", serde_json::Value::Null).await?;
        config.validate()?;
        private(&config.root, true)?;
        Ok(config)
    }
    pub async fn capability(&self, nodes: &[String]) -> Result<StorageCapability> {
        self.call(
            "capability",
            serde_json::to_value(nodes).map_err(|_| ExecutionError::Invalid("nodes"))?,
        )
        .await
    }
    pub async fn ensure(&self, packet: &StoragePacket) -> Result<(StorageConfig, PathBuf)> {
        packet.validate()?;
        let (config, path): (StorageConfig, PathBuf) = self
            .call(
                "ensure",
                serde_json::to_value(packet)
                    .map_err(|_| ExecutionError::Invalid("storage packet"))?,
            )
            .await?;
        config.validate()?;
        if config.cluster_id != packet.cluster_id
            || path != config.root.join(packet.app_id.as_str()).join("mount/data")
        {
            return Err(ExecutionError::Ownership);
        }
        Ok((config, path))
    }
    pub async fn retained(&self, packet: &StoragePacket) -> Result<()> {
        packet.validate()?;
        self.call(
            "retained",
            serde_json::to_value(packet).map_err(|_| ExecutionError::Invalid("storage packet"))?,
        )
        .await
    }
    pub async fn volume_state(&self, packet: &StoragePacket) -> Result<VolumeState> {
        packet.validate()?;
        self.call(
            "state",
            serde_json::to_value(packet).map_err(|_| ExecutionError::Invalid("storage packet"))?,
        )
        .await
    }
    pub async fn purge(&self, packet: &StoragePacket) -> Result<()> {
        packet.validate()?;
        self.call(
            "purge",
            serde_json::to_value(packet).map_err(|_| ExecutionError::Invalid("storage packet"))?,
        )
        .await
    }
}
