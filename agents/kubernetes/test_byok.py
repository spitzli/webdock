import unittest
from unittest.mock import patch
import byok
class ByokTests(unittest.TestCase):
 def test_inventory_excludes_secrets_and_tracks_unhealthy_nodes(self):
  raw={'kind':'Pod','metadata':{'uid':'uid','name':'api','namespace':'apps','resourceVersion':'12','annotations':{'password':'no'}},'spec':{'containers':[{'env':[{'value':'secret'}],'resources':{'requests':{'cpu':'100m','memory':'128Mi'}}}]},'status':{'phase':'Pending'}}
  result=byok.summarize(raw,'Pod')
  self.assertEqual(result['status'],'pending');self.assertEqual(result['cpuMillicores'],100)
  self.assertNotIn('secret',str(result));self.assertNotIn('password',str(result))
 def test_scale_patch_is_fenced_and_preserves_spec(self):
  obj={'metadata':{'uid':'u','resourceVersion':'4'},'spec':{'replicas':2,'template':{'metadata':{'labels':{'keep':'yes'}}}}}
  patch_ops=byok.mutation_patch(obj,'scale',3,'operation')
  self.assertEqual(patch_ops[:2],[{'op':'test','path':'/metadata/uid','value':'u'},{'op':'test','path':'/metadata/resourceVersion','value':'4'}])
  self.assertEqual(patch_ops[-1],{'op':'add','path':'/spec/replicas','value':3})
 def test_restart_preserves_annotations(self):
  obj={'metadata':{'uid':'u','resourceVersion':'4'},'spec':{'template':{'metadata':{'annotations':{'keep':'yes'}}}}}
  operations=byok.mutation_patch(obj,'restart',None,'op')
  self.assertEqual(len(operations),3);self.assertEqual(operations[-1]['path'],'/spec/template/metadata/annotations/webdock.dev~1restart')
 def test_management_blocks_system_namespaces(self):
  self.assertFalse(byok.allowed_namespace('kube-system',['kube-system']))
  self.assertTrue(byok.allowed_namespace('apps',['apps']))
 def test_restart_waits_for_old_pods_to_leave(self):
  current={'metadata':{'generation':2},'spec':{'replicas':1,'template':{'metadata':{'annotations':{'webdock.dev/restart':'op'}}}},'status':{'observedGeneration':2,'replicas':2,'updatedReplicas':1,'readyReplicas':1,'availableReplicas':1}}
  self.assertFalse(byok.rollout_ready(current,'Deployment','op'))
  current['status']['replicas']=1
  self.assertTrue(byok.rollout_ready(current,'Deployment','op'))
 def test_rbac_has_no_secrets_exec_or_cluster_write(self):
  from permissions import permissions
  doc=permissions(['apps'])
  for item in doc['items']:
   for rule in item.get('rules',[]):
    self.assertFalse(set(rule['resources'])&{'secrets','configmaps','pods/exec','pods/attach','*'})
    if item['kind']=='ClusterRole':self.assertEqual(rule['verbs'],['get','list'])
    else:self.assertEqual(item['metadata']['namespace'],'apps')
  with self.assertRaises(ValueError):permissions(['kube-system'])
 def test_paused_deployment_is_not_restarted(self):
  from datetime import datetime,timedelta,timezone
  current={'metadata':{'uid':'u','resourceVersion':'4','name':'app','namespace':'apps'},'spec':{'paused':True,'replicas':1}}
  packet={'resource':{'uid':'u','resourceVersion':'4','name':'app','namespace':'apps','kind':'Deployment'},'action':'restart','clusterUID':'cluster','leaseUntil':(datetime.now(timezone.utc)+timedelta(minutes=2)).isoformat(),'operationID':'op'}
  with patch.object(byok,'cluster_uid',return_value='cluster'),patch.object(byok,'obj',return_value=current),patch.object(byok,'kubectl') as command:
   with self.assertRaisesRegex(ValueError,'controller_conflict'):byok.execute(packet,['apps'])
   command.assert_not_called()
 def test_scaling_cannot_delete_statefulset_volumes(self):
  current={'spec':{'replicas':2,'persistentVolumeClaimRetentionPolicy':{'whenScaled':'Delete'}}}
  self.assertFalse(byok.safe_scaling(current,0))
  self.assertTrue(byok.safe_scaling(current,3))
  current['spec']['persistentVolumeClaimRetentionPolicy']['whenScaled']='Retain'
  self.assertTrue(byok.safe_scaling(current,0))
