import unittest
from mail_executor import mail_isolation_policy
from mail_submission import submission_network_policy, validate_submission

class SubmissionPolicyTest(unittest.TestCase):
    def profile(self):
        return {'customerID':'123','hostname':'mail-123.mail.example.test','username':'wd-submit@mail-123.mail.example.test','password':'p'*32,'hookToken':'wd_hook_123_'+'t'*43,'relayHost':'pro.eu.turbo-smtp.com','relayUsername':'consumer-key','relayPassword':'consumer-secret','transportRevision':'1'}

    def test_egress_is_only_explicit_public_relay_ips_and_internal_policy(self):
        p=self.profile();validate_submission(p)
        with self.assertRaises(ValueError):
            submission_network_policy(p, {'webdock.dev/app-id':'123'}, ['203.0.113.1'])

    def test_native_instance_has_no_generic_same_namespace_egress(self):
        policy=mail_isolation_policy('123','789')
        self.assertEqual(policy['spec']['egress'],[])
        self.assertEqual(policy['spec']['ingress'],[])
        self.assertNotIn('webdock.dev/app-id',policy['metadata']['labels'])

    def test_private_and_unapproved_relay_endpoints_are_rejected(self):
        for host in ['localhost','127.0.0.1','other.example.com']:
            with self.assertRaises(ValueError):validate_submission({**self.profile(),'relayHost':host})
        with self.assertRaises(ValueError):submission_network_policy(self.profile(),{},['10.0.0.1'])
        with self.assertRaises(ValueError):submission_network_policy(self.profile(),{},[])
        valid=submission_network_policy(self.profile(),{'webdock.dev/app-id':'123'},['1.1.1.1'])
        ports=[port['port'] for entry in valid['spec']['egress'] for port in entry['ports']]
        self.assertEqual(ports,[465,3139]);self.assertNotIn(25,ports)
        self.assertEqual(valid['spec']['ingress'][0]['ports'],[{'protocol':'TCP','port':2465}])

    def test_runtime_proof_requires_live_isolation_and_preserves_replica_ownership(self):
        import json
        from unittest.mock import patch,MagicMock
        from mail_submission import execute_submission
        from test_mail_configuration import packet
        value=packet();value['submission']=self.profile()
        labels={'security.webdock.dev/managed-by':'webdock','webdock.dev/project-id':'123','webdock.dev/app-id':'123','webdock.dev/cluster-id':'789'}
        deployment={'metadata':{'name':'app-123','namespace':'wd-mail-123','labels':labels,'uid':'owned','resourceVersion':'1','generation':2},'status':{'observedGeneration':2,'updatedReplicas':1,'availableReplicas':1}}
        service={'metadata':{'namespace':'wd-mail-123'}}
        policy=submission_network_policy(value['submission'],labels,['1.1.1.1'])
        resources={'accountID':'account','hookID':'hook','routeID':'route','tlsID':'tls','certificateID':'certificate'}
        def get(kind,name,namespace):
            if kind=='networkpolicy':return policy
            if kind=='deployment':return deployment
            if kind=='service':return {'metadata':{'labels':{'security.webdock.dev/managed-by':'webdock'}},'spec':{'clusterIP':'10.43.0.1'}}
            raise AssertionError('Unexpected resource read')
        for outcome in ['denied','allowed']:
            def kubectl(*args,**kwargs):
                if 'networkpolicies' in args:return json.dumps({'items':[policy,mail_isolation_policy('123','789')]})
                if 'patch' in args:
                    self.assertIn('--field-manager=webdock-mail-config',args)
                    body=json.loads(args[-1]);self.assertNotIn('replicas',body['spec'])
                    self.assertIsNone(body['spec']['template']['metadata']['labels']['security.webdock.dev/ingress'])
                    return ''
                if 'exec' in args:return outcome
                raise AssertionError('Unexpected kubectl operation')
            with patch('mail_submission.verify_relay',return_value=['1.1.1.1']),patch('mail_submission.configure_submission',return_value=resources),patch('mail_submission.verify_submission_listener',return_value='a'*64),patch('mail_submission.socket.create_connection'),patch('executor.get',side_effect=get),patch('executor.apply'),patch('executor.kubectl',side_effect=kubectl):
                if outcome=='denied':self.assertEqual(execute_submission(MagicMock(),value,deployment,service,lambda:None),{'ready':True,'resources':resources,'certificateSha256':'a'*64})
                else:
                    with self.assertRaisesRegex(ValueError,'isolation'):execute_submission(MagicMock(),value,deployment,service,lambda:None)
