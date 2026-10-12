import unittest

from inventory import quantity, pod_resources, summarize_cluster


class InventoryTests(unittest.TestCase):
    def test_quantities_keep_gib_distinct_from_gb_and_round_up(self):
        self.assertEqual(quantity('1Gi'), 1073741824)
        self.assertEqual(quantity('1G'), 1000000000)
        self.assertEqual(quantity('500m', cpu=True), 500)
        self.assertEqual(quantity('0.0001', cpu=True), 1)
        for value in ['-1', 'unknown', '', 'NaN', 'Infinity']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                quantity(value)

    def test_pod_peak_includes_restartable_init_and_overhead(self):
        pod = {'spec': {
            'containers': [{'resources': {'requests': {'cpu': '500m', 'memory': '1Gi'}}}],
            'initContainers': [
                {'restartPolicy': 'Always', 'resources': {'requests': {'cpu': '100m', 'memory': '128Mi'}}},
                {'resources': {'requests': {'cpu': '2', 'memory': '512Mi'}}},
            ],
            'overhead': {'cpu': '50m', 'memory': '64Mi'},
        }}
        self.assertEqual(pod_resources(pod, 'requests'), {
            'cpuMillicores': 2150, 'memoryBytes': 1275068416, 'ephemeralBytes': 0})

    def test_pod_level_resources_override_container_resources(self):
        pod = {'spec': {
            'containers': [{'resources': {'requests': {'cpu': '100m', 'memory': '64Mi'}}}],
            'resources': {'requests': {'cpu': '1', 'memory': '1Gi'}},
        }}
        self.assertEqual(pod_resources(pod, 'requests')['cpuMillicores'], 1000)
        self.assertEqual(pod_resources(pod, 'requests')['memoryBytes'], 1073741824)

    def test_summary_counts_pending_excludes_completed_and_omits_secrets(self):
        nodes = {'items': [{'metadata': {'name': 'node-02', 'annotations': {'private': 'secret'}},
            'spec': {}, 'status': {'allocatable': {'cpu': '5', 'memory': '10Gi'},
            'nodeInfo': {'kubeletVersion': 'v1.36.5+k3s1'},
            'conditions': [{'type': 'Ready', 'status': 'True'}]}}]}
        pods = {'items': [
            {'metadata': {'name': 'running', 'namespace': 'test'},
             'spec': {'nodeName': 'node-02', 'containers': [{'env': [{'value': 'password'}],
                 'resources': {'requests': {'cpu': '1', 'memory': '1Gi'}}}]},
             'status': {'phase': 'Running'}},
            {'metadata': {'name': 'pending', 'namespace': 'test'},
             'spec': {'containers': [{'resources': {'requests': {'cpu': '2'}}}]},
             'status': {'phase': 'Pending'}},
            {'metadata': {'name': 'done', 'namespace': 'test'},
             'spec': {'nodeName': 'node-02', 'containers': [{'resources': {'requests': {'cpu': '3'}}}]},
             'status': {'phase': 'Succeeded'}},
        ]}
        result = summarize_cluster(nodes, pods)
        self.assertEqual(result['nodes'][0]['requests']['cpuMillicores'], 1000)
        self.assertEqual(result['nodes'][0]['guardedHeadroom']['cpuMillicores'], 3000)
        self.assertEqual(result['unplacedRequests']['cpuMillicores'], 2000)
        self.assertNotIn('password', str(result))
        self.assertNotIn('secret', str(result))
        self.assertFalse(result['admissionApproved'])

    def test_unbounded_limits_are_visible_instead_of_zero_limit(self):
        node = {'metadata': {'name': 'n'}, 'status': {'allocatable': {'cpu': '4', 'memory': '8Gi'}}}
        pod = {'metadata': {'name': 'p', 'namespace': 'test'},
               'spec': {'nodeName': 'n', 'containers': [{'resources': {'limits': {'memory': '1Gi'}}}]}}
        result = summarize_cluster({'items': [node]}, {'items': [pod]})
        self.assertEqual(result['nodes'][0]['unboundedLimitDimensions'], ['cpuMillicores', 'ephemeralBytes'])
        self.assertEqual(result['workloads'][0]['unboundedLimitDimensions'], ['cpuMillicores', 'ephemeralBytes'])

    def test_zero_limit_is_unbounded(self):
        node = {'metadata': {'name': 'n'}, 'status': {'allocatable': {'cpu': '4', 'memory': '8Gi'}}}
        pod = {'metadata': {'name': 'p', 'namespace': 'test'},
               'spec': {'nodeName': 'n', 'containers': [{'resources': {'limits': {'cpu': '0'}}}]}}
        result = summarize_cluster({'items': [node]}, {'items': [pod]})
        self.assertIn('cpuMillicores', result['workloads'][0]['unboundedLimitDimensions'])

    def test_missing_allocatable_fails_instead_of_claiming_free_capacity(self):
        with self.assertRaises(ValueError):
            summarize_cluster({'items': [{'metadata': {'name': 'broken'}, 'status': {}}]}, {'items': []})


if __name__ == '__main__':
    unittest.main()
