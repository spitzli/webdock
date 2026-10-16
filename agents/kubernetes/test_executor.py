import unittest
from datetime import datetime, timezone, timedelta
from executor import manifests, validate_packet, ExecutionError, bounded_logs, environment_secret
import json
from unittest.mock import patch
from executor import cleanup_environment, referenced_environment, prepare_namespace

class ExecutorTests(unittest.TestCase):
    def test_secret_cleanup_keeps_running_references_and_quota_has_rotation_room(self):
        p=self.packet();p['revision']=3
        refs=referenced_environment([{'spec':{'containers':[{'env':[{'name':'TOKEN','valueFrom':{'secretKeyRef':{'name':'app-123-env-1','key':'TOKEN'}}}]}]}}])
        self.assertEqual(refs,{'app-123-env-1'})
        secrets=[{'metadata':{'name':'app-123-env-'+str(n)}} for n in (1,2,3)]
        with patch('executor.kubectl',return_value=json.dumps({'items':secrets})),patch('executor.guarded_delete') as delete:
            cleanup_environment(p,refs|{'app-123-env-3'})
            self.assertEqual(delete.call_count,1)
            self.assertEqual(delete.call_args.args[1]['metadata']['name'],'app-123-env-2')
        p['quota']['apps']=20
        with patch('executor.get',return_value=None),patch('executor.kubectl'),patch('executor.apply') as apply:
            prepare_namespace(p,p['namespace'])
            quota=next(c.args[0] for c in apply.call_args_list if c.args[0]['kind']=='ResourceQuota')
            self.assertGreater(int(quota['spec']['hard']['count/secrets']),40)
    def test_environment_uses_owned_revision_secret_not_plaintext_deployment(self):
        p=self.packet();p.update(environmentVersion=1,environment={'TOKEN':'private-test-value','EMPTY':''})
        validate_packet(p)
        deployment,_=manifests(p);secret=environment_secret(p)
        self.assertNotIn('private-test-value',json.dumps(deployment))
        self.assertEqual(secret['metadata']['namespace'],p['namespace'])
        self.assertTrue(secret['immutable'])
        self.assertEqual(secret['metadata']['labels']['webdock.dev/app-id'],'123')
        env=deployment['spec']['template']['spec']['containers'][0]['env']
        self.assertEqual(env[0]['valueFrom']['secretKeyRef']['name'],'app-123-env-1')
        for values in [{'bad-name':'x'},{'A':'a\0b'},{'A':'é'*4096}]:
            p['environment']=values
            with self.assertRaises(ExecutionError):validate_packet(p)
    def packet(self):
        return {'appID':'123','projectID':'456','clusterID':'789','namespace':'wd-456','operationID':'101','generation':1,'leaseUntil':(datetime.now(timezone.utc)+timedelta(seconds=60)).isoformat(),'revision':1,'action':'apply','expectedUID':None,'quota':{'apps':1,'cpuMillicores':100,'memoryBytes':67108864,'ephemeralBytes':67108864},'spec':{'template':'healthcheck','image':'docker.io/rancher/mirrored-library-traefik@sha256:'+'a'*64,'args':['--ping'],'port':8080,'healthPath':'/ping','replicas':1,'cpuMillicores':100,'memoryBytes':67108864,'ephemeralBytes':67108864}}
    def test_pod_security_and_no_hidden_rollout_surge(self):
        p=self.packet(); validate_packet(p);deployment,service=manifests(p)
        pod=deployment['spec']['template']['spec'];c=pod['containers'][0]
        self.assertEqual(deployment['spec']['strategy'],{'type':'Recreate'})
        self.assertFalse(pod['automountServiceAccountToken']);self.assertTrue(c['securityContext']['readOnlyRootFilesystem'])
        self.assertEqual(c['imagePullPolicy'],'Never')
        self.assertEqual(c['resources']['requests'],c['resources']['limits'])
        for probe in ['startupProbe','readinessProbe','livenessProbe']:self.assertIn(probe,c)
        self.assertEqual(service['spec']['type'],'ClusterIP')
    def test_logs_fit_transport_even_for_unicode_and_control_characters(self):
        for value in ['\x00'*20000, '😀'*20000, 'ü'*20000]:
            bounded=bounded_logs(value)
            self.assertLessEqual(len(bounded.encode('utf-8')),6000)
            self.assertLess(len(json.dumps({'logs':bounded})),60000)

    def test_foreign_namespace_expired_lease_and_bad_resources_rejected(self):
        for patch in [{'namespace':'kube-system'},{'appID':'1;touch /tmp/x'},{'leaseUntil':'2000-01-01T00:00:00Z'},{'action':'shell'}]:
            with self.assertRaises(ExecutionError):validate_packet({**self.packet(),**patch})
        p=self.packet();p['spec']['cpuMillicores']=0
        with self.assertRaises(ExecutionError):validate_packet(p)

if __name__=='__main__':unittest.main()
