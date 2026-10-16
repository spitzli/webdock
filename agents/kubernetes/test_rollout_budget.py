"""Exercise the full rollout and both executor transports without real waits."""
import contextlib
import copy
from datetime import datetime, timedelta, timezone
import io
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import connect
import daemon
import executor


class RolloutBudgetTests(unittest.TestCase):
    def rollout(self, ready_after, lease_seconds=300, preparation_seconds=60):
        from test_executor import ExecutorTests
        packet=ExecutorTests().packet()
        packet['finalQuota']=packet['quota']
        start=datetime.now(timezone.utc)
        packet['leaseUntil']=(start+timedelta(seconds=lease_seconds)).isoformat()
        clock=SimpleNamespace(seconds=0,applied=None,observed_after=None)
        class ClockDateTime(datetime):
            @classmethod
            def now(cls,tz=None):return start+timedelta(seconds=clock.seconds)
        def sleep(seconds):clock.seconds+=seconds
        def prepare(*args):
            if clock.applied is None:clock.seconds+=preparation_seconds/2
        def apply(obj,p):
            if obj['kind']=='Deployment':
                clock.applied=clock.seconds
                clock.deployment=copy.deepcopy(obj)
                clock.deployment['metadata'].update(uid='owned-deployment',generation=1)
        def ready():return clock.applied is not None and clock.seconds-clock.applied>=ready_after
        def get(kind,*args):
            if kind!='deployment' or clock.applied is None:return None
            clock.observed_after=clock.seconds-clock.applied
            result=copy.deepcopy(clock.deployment)
            result['status']={'observedGeneration':1,'updatedReplicas':1,'availableReplicas':int(ready())}
            return result
        def pods(p):
            if clock.applied is None:return []
            return [{'metadata':{'labels':executor.labels(packet),'annotations':{'webdock.dev/revision':'1'}},'status':{'conditions':[{'type':'Ready','status':'True' if ready() else 'False'}]}}]
        with patch.object(executor,'datetime',ClockDateTime),patch.object(executor.time,'monotonic',side_effect=lambda:clock.seconds),patch.object(executor.time,'sleep',side_effect=sleep),patch.object(executor,'get',side_effect=get),patch.object(executor,'pods',side_effect=pods),patch.object(executor,'prepare_namespace',side_effect=prepare),patch.object(executor,'cleanup_environment'),patch.object(executor,'kubectl'),patch.object(executor,'apply',side_effect=apply):
            self.clock=clock
            return executor.execute(packet)

    def test_delayed_readiness_after_recreate_and_image_pull_returns_proof(self):
        result=self.rollout(ready_after=90)
        self.assertEqual(result,{'appID':'123','revision':1,'namespace':'wd-456','uid':'owned-deployment','ready':True,'deleted':False,'replicas':1})
        self.assertEqual(self.clock.seconds,150)
        self.assertEqual(self.clock.observed_after,90)

    def test_unready_rollout_stops_at_180_seconds(self):
        with self.assertRaisesRegex(executor.ExecutionError,'rollout_timeout'):
            self.rollout(ready_after=float('inf'))
        self.assertEqual(self.clock.seconds-self.clock.applied,180)

    def test_expired_lease_still_stops_readiness_before_full_budget(self):
        with self.assertRaisesRegex(executor.ExecutionError,'execution_failed'):
            self.rollout(ready_after=100,lease_seconds=80,preparation_seconds=0)
        self.assertEqual(self.clock.seconds,80)

    def transport(self,command,**kwargs):
        if kwargs.get('timeout',0)<240:raise subprocess.TimeoutExpired(command,kwargs['timeout'])
        self.assertEqual(kwargs['timeout'],260)
        return SimpleNamespace(stdout=json.dumps({'outcome':'succeeded','proof':{'ready':True}}))

    def test_local_transport_allows_preparation_and_full_readiness(self):
        with patch.object(daemon.subprocess,'run',side_effect=self.transport):
            self.assertEqual(daemon.execute_local({'operationID':'123'})['outcome'],'succeeded')

    def test_ssh_transport_allows_preparation_and_full_readiness(self):
        with tempfile.TemporaryDirectory() as directory:
            state=Path(directory)/'connection.json'
            state.write_text(json.dumps({'endpoint':'https://auth.example','clusterID':'123','credential':'x'*43,'generation':1,'sequence':0}));state.chmod(0o600)
            args=SimpleNamespace(credentials=str(state),ssh='root@node.example',identity='/private/key',allow_loopback=False,interval=15,manage=True,once=True)
            completions=[]
            def request(origin,state,route,body):
                if route=='claim':return {'id':'456','generation':1,'desired':{'operationID':'456'}}
                if route=='complete':completions.append(body)
            def process(command,**kwargs):
                if "namespace['main']" in kwargs['input']:return self.transport(command,**kwargs)
                return SimpleNamespace(stdout=json.dumps({'version':'fixture','nodes':[],'observedAt':'now'}))
            with patch.object(connect.subprocess,'run',side_effect=process),patch.object(connect,'agent_request',side_effect=request),contextlib.redirect_stdout(io.StringIO()):
                connect.run(args)
            self.assertEqual(completions,[{'id':'456','generation':1,'outcome':'succeeded','proof':{'ready':True}}])
