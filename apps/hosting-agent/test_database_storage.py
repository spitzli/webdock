import copy
from datetime import datetime, timedelta, timezone
from unittest import TestCase
from unittest.mock import patch
import database_storage


def packet():
    return {'version': 1, 'installationID': '123', 'clusterID': '456', 'revision': 1,
            'node': 'pilot-node', 'poolID': 'bd0ba8e4-e801-4c16-bf1b-060129437ccb',
            'volumeBytes': 1073741824,
            'leaseUntil': (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat()}


class DatabaseStorageTests(TestCase):
    def test_only_bounded_fenced_installer_identity_is_accepted(self):
        self.assertEqual(database_storage.validate(packet())['installationID'], '123')
        for change in [{'installationID':'../../data'}, {'revision':True}, {'volumeBytes':True},
                       {'volumeBytes':0}, {'node':'a; rm'}, {'version':2}, {'path':'/etc'},
                       {'leaseUntil':'2000-01-01T00:00:00+00:00'}, {'poolID':'other'}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                database_storage.validate({**packet(), **change})

    def test_pv_is_prebound_retained_and_pinned_to_storage_node(self):
        value=packet()
        pv=database_storage.persistent_volume(value, '/private/pool/123/mount/data')
        self.assertEqual(pv['spec']['persistentVolumeReclaimPolicy'], 'Retain')
        self.assertEqual(pv['spec']['claimRef'], {'namespace':'wd-db-123','name':'postgres-1'})
        self.assertEqual(pv['spec']['storageClassName'], '')
        self.assertEqual(pv['spec']['nodeAffinity']['required']['nodeSelectorTerms'][0]['matchExpressions'][0]['values'], ['pilot-node'])

    def test_foreign_pool_never_reaches_storage_allocation(self):
        conf={'node':'pilot-node','poolID':packet()['poolID'],'clusterID':'999'}
        with patch.object(database_storage.storage, 'configuration', return_value=conf), patch.object(database_storage.storage, 'ensure') as ensure:
            with self.assertRaises(ValueError): database_storage.ensure(packet())
            ensure.assert_not_called()
