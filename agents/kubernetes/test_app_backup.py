import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import app_backup as b

class BackupTest(unittest.TestCase):
    def test_archive_rejects_path_escape_and_links(self):
        for name,kind in [('../escape',tarfile.REGTYPE),('/absolute',tarfile.REGTYPE),('media/link',tarfile.SYMTYPE),('media/device',tarfile.CHRTYPE)]:
            with self.subTest(name=name),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'media.tar'
                with tarfile.open(path,'w') as archive:
                    item=tarfile.TarInfo(name);item.type=kind;archive.addfile(item)
                with self.assertRaises(ValueError):b.inspect_media(path)

    def test_manifest_detects_corruption(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'database.dump').write_bytes(b'dump');(root/'database-fingerprint.txt').write_bytes(b'rows')
            with tarfile.open(root/'media.tar','w') as archive:
                item=tarfile.TarInfo('media/image.png');item.size=3;archive.addfile(item,io.BytesIO(b'abc'))
            manifest={'version':1,'files':{name:b.sha256(root/name) for name in ['database.dump','media.tar','database-fingerprint.txt']},'media':b.inspect_media(root/'media.tar')}
            (root/'manifest.json').write_text(json.dumps(manifest));b.verify_set(root)
            (root/'database.dump').write_bytes(b'changed')
            with self.assertRaises(ValueError):b.verify_set(root)

    def test_restore_must_be_isolated(self):
        source={'projectID':'1','appID':'2','databaseID':'3','backendID':'4','namespace':'wd-1'}
        for changed in [source,{**source,'appID':'9'},{**source,'databaseID':'9'}]:
            with self.assertRaises(ValueError):b.assert_isolated(source,changed)
        b.assert_isolated(source,{'projectID':'9','appID':'8','databaseID':'7','backendID':'4','namespace':'wd-9'})

    def test_fence_disables_both_writers_before_stopping_deployment(self):
        config={'databaseID':'3','appID':'2','namespace':'wd-1'};calls=[]
        with patch.object(b,'identity',return_value={'spec':{'replicas':1}}),patch.object(b,'sql',side_effect=lambda c,sql:calls.append(sql)),patch.object(b,'scale',side_effect=lambda *args:calls.append('scaled')),patch.object(b.e,'kubectl',return_value='{"items":[]}'):
            self.assertEqual(b.fence(config),1)
        self.assertIn('wd_app_3" NOLOGIN',calls[0]);self.assertIn('wd_migrate_3" NOLOGIN',calls[0]);self.assertIn('pg_terminate_backend',calls[0]);self.assertEqual(calls[1],'scaled')

    def test_invalid_restore_is_rejected_before_fence(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(b,'fence') as fence:
            with self.assertRaises(FileNotFoundError):b.restore({},Path(tmp))
            fence.assert_not_called()

    def test_existing_restore_database_is_rejected_before_fence(self):
        source={'projectID':'1','appID':'2','databaseID':'3','namespace':'wd-1','image':'digest'}
        target={'projectID':'4','appID':'5','databaseID':'6','namespace':'wd-4','image':'digest'}
        with patch.object(b,'verify_set',return_value={'source':source}),patch.object(b,'identity'),patch.object(b,'sql',return_value='1'),patch.object(b,'fence') as fence:
            with self.assertRaisesRegex(ValueError,'unmigrated'):b.restore(target,Path('/unused'))
            fence.assert_not_called()

    def test_same_row_count_different_content_fingerprint_is_not_equal(self):
        # The existing Postgres fingerprint includes sorted row hashes alongside counts.
        self.assertIn('row_to_json(t)::text',b.COUNTS_SQL)
        self.assertIn('ORDER BY pg_catalog.md5',b.COUNTS_SQL)
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'rows';path.write_bytes(b'["pages",1,"first-content-digest"]\n');original=b.sha256(path)
            path.write_bytes(b'["pages",1,"different-content-digest"]\n')
            self.assertNotEqual(original,b.sha256(path))

    def test_backup_restores_exact_original_role_states(self):
        from types import SimpleNamespace
        for app_login,migrate_login in [(False,False),(True,False),(False,True),(True,True)]:
            with self.subTest(app=app_login,migration=migrate_login),tempfile.TemporaryDirectory() as tmp:
                config={'databaseID':'3','backendID':'4','appID':'2','namespace':'wd-1','volumeBytes':100};calls=[]
                roles={'wd_app_3':app_login,'wd_migrate_3':migrate_login}
                def sql(c,statement,database='postgres'):
                    calls.append(statement)
                    if 'pg_database_size' in statement:return '1'
                    if 'rolcanlogin' in statement:return json.dumps(roles)
                    if 'json_agg(name' in statement:return '[]'
                    return ''
                with patch.object(b.subprocess,'run',return_value=SimpleNamespace(stdout='nfs')),patch.object(b.shutil,'disk_usage',return_value=SimpleNamespace(free=10000)),patch.object(b,'sql',side_effect=sql),patch.object(b,'fence',return_value=1),patch.object(b,'helper',return_value='helper'),patch.object(b,'raw'),patch.object(b,'fingerprint'),patch.object(b,'inspect_media',return_value={}),patch.object(b,'verify_set'),patch.object(b,'delete_helper'),patch.object(b,'identity',return_value={'spec':{'replicas':0}}),patch.object(b,'scale'):
                    directory=b.backup(config,Path(tmp))
                resume=next(value for value in calls if 'ALTER ROLE' in value)
                self.assertIn('"wd_app_3" '+('LOGIN' if app_login else 'NOLOGIN'),resume)
                self.assertIn('"wd_migrate_3" '+('LOGIN' if migrate_login else 'NOLOGIN'),resume)
                self.assertEqual(json.loads((directory/'fence.json').read_text())['roles'],roles)

    def test_failed_backup_leaves_both_roles_fenced(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            calls=[];config={'databaseID':'3','appID':'2','volumeBytes':100}
            def sql(c,statement,database='postgres'):
                calls.append(statement)
                return json.dumps({'wd_app_3':True,'wd_migrate_3':False}) if 'rolcanlogin' in statement else '1'
            with patch.object(b.subprocess,'run',return_value=SimpleNamespace(stdout='nfs')),patch.object(b.shutil,'disk_usage',return_value=SimpleNamespace(free=10000)),patch.object(b,'sql',side_effect=sql),patch.object(b,'fence',return_value=1) as fence,patch.object(b,'helper',side_effect=RuntimeError('dump failure')),patch.object(b,'scale') as scale:
                with self.assertRaises(RuntimeError):b.backup(config,Path(tmp))
            fence.assert_called_once();scale.assert_not_called();self.assertFalse(any('ALTER ROLE' in value for value in calls))

if __name__=='__main__':unittest.main()
