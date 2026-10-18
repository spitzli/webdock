import copy
import json
import unittest
from unittest.mock import patch
import databases as d
from test_database_storage import packet

FIRST='bd0ba8e4-e801-4c16-bf1b-060129437ccb'
SECOND='cc0ba8e4-e801-4c16-bf1b-060129437ccb'
def config():return {'storageSocket':'/run/webdock-postgres-storage/control.sock','additionalStoragePools':[{'node':'cms-node','poolID':SECOND,'storageSocket':'/run/webdock-postgres-storage/cms.sock'}]}
def inventory(node,pool):return {'node':node,'poolID':pool,'ready':True,'capacityBytes':1073741824,'availableBytes':1073741824,'allocatedBytes':0,'allocations':[]}

class DatabasePoolsTests(unittest.TestCase):
    def test_additional_pool_configuration_is_bounded_and_unique(self):
        self.assertEqual(len(d.storage_routes(config())),2)
        self.assertEqual(len(d.storage_routes({'storageSocket':config()['storageSocket']})),1)
        for invalid in [
            {'storageSocket':'/run/webdock-postgres-storage/../../tmp/socket'},
            {**config(),'additionalStoragePools':[config()['additionalStoragePools'][0]]*2},
            {**config(),'additionalStoragePools':[{**config()['additionalStoragePools'][0],'storageSocket':config()['storageSocket']}]},
            {**config(),'additionalStoragePools':[{**config()['additionalStoragePools'][0],'node':'bad;node'}]},
        ]:
            with self.subTest(invalid=invalid),self.assertRaises(ValueError):d.storage_routes(invalid)

    def test_every_storage_action_routes_to_exact_pool_without_fallback(self):
        calls=[]
        def request(action,value,socket_path):
            calls.append((action,socket_path))
            if action=='database.capability':return inventory('pilot-node',FIRST) if socket_path.endswith('control.sock') else inventory('cms-node',SECOND)
            return {'state':'ready'}
        target={**packet(),'node':'cms-node','poolID':SECOND}
        with patch('storage_client.request',side_effect=request),patch.object(d,'kubectl',return_value=json.dumps({'items':[{'metadata':{'name':n}} for n in ['pilot-node','cms-node']]})):
            for action in ['database.ensure','database.state','database.retained','database.purge']:d.storage_request(config(),action,target)
            with self.assertRaises(ValueError):d.storage_request(config(),'database.ensure',{**target,'poolID':FIRST})
        mutations=[c for c in calls if c[0]!='database.capability']
        self.assertEqual(mutations,[(action,'/run/webdock-postgres-storage/cms.sock') for action in ['database.ensure','database.state','database.retained','database.purge']])

    def test_claimed_pool_identity_mismatch_is_rejected_before_mutation(self):
        def request(action,value,socket_path):return inventory('pilot-node',FIRST)
        with patch('storage_client.request',side_effect=request) as rpc,self.assertRaises(ValueError):d.storage_pools(config(),['pilot-node','cms-node'])
        self.assertTrue(all(c.args[0]=='database.capability' for c in rpc.call_args_list))

    def test_two_pool_observation_reads_kubernetes_inventory_once(self):
        objects={
            'nodes':{'items':[{'metadata':{'name':n},'spec':{},'status':{'conditions':[{'type':'Ready','status':'True'}]}} for n in ['pilot-node','cms-node']]},
            'pods':{'items':[{'metadata':{'namespace':'apps'},'status':{'phase':'Running'},'spec':{'nodeName':'cms-node','containers':[{'resources':{'requests':{'cpu':'100m','memory':'64Mi'}}}]}}]},
            'services':{'items':[]}}
        def kube(*args):return json.dumps(objects[args[1]])
        def get(kind,name,namespace=None):
            if kind=='deployment':return {'status':{'availableReplicas':1}}
            return {'metadata':{'labels':{'webdock.dev/database-boundary-version':'1'}},'spec':{'validationActions':['Deny']}}
        for offline in [False,True]:
            def request(action,value,socket_path):
                if socket_path.endswith('cms.sock') and offline:raise FileNotFoundError('additional socket unavailable')
                return inventory('pilot-node',FIRST) if socket_path.endswith('control.sock') else inventory('cms-node',SECOND)
            with self.subTest(offline=offline),patch.object(d,'configuration',return_value=config()),patch.object(d,'get',side_effect=get),patch.object(d,'kubectl',side_effect=kube) as kubectl,patch('storage_client.request',side_effect=request):
                result=d.database_capability(['pilot-node','cms-node'])
            self.assertEqual([p['requestedCpuMillicores'] for p in result['databasePools']],[0] if offline else [0,100])
            self.assertEqual([c.args[1] for c in kubectl.call_args_list],['nodes','pods','services'])

    def test_offline_extra_never_blocks_primary_operations_or_inventory(self):
        calls=[]
        def request(action,value,socket_path):
            calls.append((action,socket_path))
            if socket_path.endswith('cms.sock'):raise ConnectionRefusedError('extra unavailable')
            if action=='database.capability':return inventory('pilot-node',FIRST)
            if value['node']!='pilot-node' or value['poolID']!=FIRST:raise ValueError('Database pool identity mismatch')
            return {'state':'ready'}
        with patch('storage_client.request',side_effect=request),patch.object(d,'kubectl',return_value=json.dumps({'items':[{'metadata':{'name':n}} for n in ['pilot-node','cms-node']]})) as kubectl:
            for action in ['database.state','database.retained','database.purge']:
                self.assertEqual(d.storage_request(config(),action,packet()),{'state':'ready'})
            self.assertFalse(any(action=='database.capability' for action,_ in calls))
            kubectl.assert_not_called()
            self.assertEqual([p['poolID'] for _,p in d.storage_pools(config(),['pilot-node','cms-node'])],[FIRST])
            with self.assertRaises(ConnectionRefusedError):d.storage_request(config(),'database.state',{**packet(),'node':'cms-node','poolID':SECOND})
            with self.assertRaises(ValueError):d.storage_request(config(),'database.state',{**packet(),'node':'unknown-node','poolID':'dd0ba8e4-e801-4c16-bf1b-060129437ccb'})
            with self.assertRaises(ValueError):d.storage_request(config(),'database.state',{**packet(),'node':'pilot-node','poolID':SECOND})

    def test_invalid_extra_identity_is_not_hidden_as_an_outage(self):
        def request(action,value,socket_path):
            if socket_path.endswith('cms.sock'):raise ValueError('Malformed or unsafe response')
            return inventory('pilot-node',FIRST)
        with patch('storage_client.request',side_effect=request),self.assertRaises(ValueError):d.storage_pools(config(),['pilot-node','cms-node'])

    def test_primary_conflicting_with_declared_extra_is_rejected_even_if_extra_down(self):
        conflicting=config();conflicting['additionalStoragePools'][0]['poolID']=FIRST
        with patch('storage_client.request',return_value=inventory('pilot-node',FIRST)),self.assertRaises(ValueError):d.storage_pools(conflicting,['pilot-node','cms-node'])
        with patch('storage_client.request') as rpc,self.assertRaises(ValueError):d.storage_request(conflicting,'database.state',packet())
        rpc.assert_not_called()

    def test_valid_unavailable_extra_pool_does_not_withdraw_primary_capability(self):
        for scenario in ['helper-not-ready','node-not-ready','cordoned','tainted','memory-pressure','disk-pressure','pid-pressure','none-ready','invalid-identity']:
            with self.subTest(scenario=scenario):
                nodes=[{'metadata':{'name':name},'spec':{},'status':{'conditions':[{'type':'Ready','status':'True'}]}} for name in ['pilot-node','cms-node']]
                extra=nodes[1]
                if scenario=='node-not-ready':extra['status']['conditions'][0]['status']='False'
                if scenario=='cordoned':extra['spec']['unschedulable']=True
                if scenario=='tainted':extra['spec']['taints']=[{'key':'maintenance','effect':'NoSchedule'}]
                pressure={'memory-pressure':'MemoryPressure','disk-pressure':'DiskPressure','pid-pressure':'PIDPressure'}.get(scenario)
                if pressure:extra['status']['conditions'].append({'type':pressure,'status':'True'})
                objects={'nodes':{'items':nodes},'pods':{'items':[]},'services':{'items':[]}}
                calls=[]
                def request(action,value,socket_path):
                    calls.append((action,socket_path))
                    primary=socket_path.endswith('control.sock')
                    if action!='database.capability':
                        self.assertTrue(primary);self.assertEqual(value['node'],'pilot-node');self.assertEqual(value['poolID'],FIRST)
                        return {'state':'ready'}
                    result=inventory('pilot-node' if primary else 'cms-node',FIRST if primary else SECOND)
                    if scenario=='none-ready' or (not primary and scenario in ['helper-not-ready','invalid-identity']):result['ready']=False
                    if not primary and scenario=='invalid-identity':result['poolID']='invalid-pool'
                    return result
                def get(kind,name,namespace=None):
                    if kind=='deployment':return {'status':{'availableReplicas':1}}
                    return {'metadata':{'labels':{'webdock.dev/database-boundary-version':'1'}},'spec':{'validationActions':['Deny']}}
                with patch.object(d,'configuration',return_value=config()),patch.object(d,'get',side_effect=get),patch.object(d,'kubectl',side_effect=lambda *args:json.dumps(objects[args[1]])),patch('storage_client.request',side_effect=request):
                    result=d.database_capability(['pilot-node','cms-node'])
                    if scenario in ['none-ready','invalid-identity']:self.assertIsNone(result)
                    else:
                        self.assertEqual(result['databaseVersion'],1)
                        self.assertEqual([p['poolID'] for p in result['databasePools']],[FIRST])
                        for action in ['database.state','database.retained','database.purge']:self.assertEqual(d.storage_request(config(),action,packet()),{'state':'ready'})
                self.assertEqual(sum(action=='database.capability' for action,_ in calls),2)
