import copy
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
import test_executor
from executor import ExecutionError, manifests, validate_packet


class StorageContractTests(unittest.TestCase):
    def test_purge_syncs_unlink_before_publishing_completion(self):
        import storage
        with tempfile.TemporaryDirectory() as root:
            directory=Path(root)/'123';directory.mkdir();(directory/'volume.ext4').write_bytes(b'fixture')
            record={'appID':'123','projectID':'456','clusterID':'789','bytes':134217728,'state':'ready'}
            p={'appID':'123','projectID':'456','clusterID':'789','spec':{'volumeBytes':134217728}}
            events=[]
            with patch('storage.configuration',return_value={'root':root,'clusterID':'789'}),patch('storage.pool',return_value={'volumes':{'123':record}}),patch('storage.read_record',return_value=record),patch('storage.records'),patch('storage.private'),patch('storage.verify_image'),patch('storage.mounted',return_value=False),patch('storage.run',return_value='{"loopdevices":[]}'),patch('storage.write_volume',side_effect=lambda d,r:events.append(r['state'])),patch('storage.sync_directory',create=True,side_effect=lambda d:events.append('sync')):
                storage.purge(p)
            self.assertFalse((directory/'volume.ext4').exists())
            self.assertEqual(events,['purging','sync','purged'])

    def test_persistent_volume_is_a_pvc_not_a_host_mount(self):
        p=test_executor.ExecutorTests().packet();p['spec']['volumeBytes']=134217728;p['storageVersion']=1
        validate_packet(p)
        pod=manifests(p)[0]['spec']['template']['spec']
        self.assertIn({'name':'data','persistentVolumeClaim':{'claimName':'app-123-data'}},pod['volumes'])
        self.assertIn({'name':'data','mountPath':'/data'},pod['containers'][0]['volumeMounts'])
        self.assertNotIn('hostPath',str(pod))
        for changes in [{'replicas':2},{'volumeBytes':1},{'volumeBytes':True},{'volumeBytes':-1}]:
            invalid=copy.deepcopy(p);invalid['spec'].update(changes)
            with self.assertRaises(ExecutionError):validate_packet(invalid)

    def test_storage_protocol_required_and_purge_is_distinct(self):
        p=test_executor.ExecutorTests().packet();p['spec']['volumeBytes']=134217728
        with self.assertRaises(ExecutionError):validate_packet(p)
        p['storageVersion']=1;p['action']='purge-storage'
        validate_packet(p)

    def test_private_helper_accepts_only_fenced_storage_requests(self):
        from storage_service import dispatch
        from storage_client import packet
        p=test_executor.ExecutorTests().packet();p['spec']['volumeBytes']=134217728
        value=packet(p)
        for invalid in [{**value,'appID':'../456'},{**value,'leaseUntil':'2000-01-01T00:00:00Z'},{**value,'path':'/etc'},{**value,'spec':{'volumeBytes':True}}]:
            with self.assertRaises(ValueError):dispatch({'action':'ensure','value':invalid})
        with self.assertRaises(ValueError):dispatch({'action':'shell','value':value})
        with patch('storage_service.storage.ensure',return_value=({'node':'test'},'/private/data')):
            self.assertEqual(dispatch({'action':'ensure','value':value})[1],'/private/data')


if __name__=='__main__':unittest.main()
