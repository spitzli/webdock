from copy import deepcopy
from unittest import TestCase
from boundary import application_patch

class BoundaryTests(TestCase):
    def test_existing_app_rules_are_not_overwritten_and_patch_is_version_fenced(self):
        policy={'metadata':{'resourceVersion':'123'},'spec':{'matchConstraints':{'namespaceSelector':{'matchExpressions':[{'key':'kubernetes.io/metadata.name','operator':'NotIn','values':['kube-system','cert-manager','another-trusted-namespace']}]}}}}
        previous=deepcopy(policy);patch=application_patch(policy)
        self.assertEqual(policy,previous)
        self.assertEqual(patch[0],{'op':'test','path':'/metadata/resourceVersion','value':'123'})
        selector=patch[1]['value']['matchExpressions']
        self.assertEqual(selector[0]['values'],['kube-system','cert-manager','another-trusted-namespace','cnpg-system'])
        self.assertEqual(selector[1],{'key':'webdock.dev/workload-class','operator':'NotIn','values':['database']})
    def test_unrecognized_policy_is_never_weakened(self):
        with self.assertRaises(ValueError):application_patch({'metadata':{'resourceVersion':'1'},'spec':{'matchConstraints':{}}})
