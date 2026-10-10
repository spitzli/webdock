"""Regression fixture from a real pinned Vercel CLI 63.1.2 Node 24 build."""
import json
from pathlib import Path
import tempfile
import unittest
import worker

class RealVercelOutputTests(unittest.TestCase):
    def output(self, directory):
        root=Path(directory)
        (root/'config.json').write_text(json.dumps({'version':3,'routes':[],'crons':[]}))
        (root/'builds.json').write_text(json.dumps({'target':'production','cliVersion':'63.1.2','builds':[]}))
        fn=root/'functions/api/health.func';fn.mkdir(parents=True)
        config={'handler':'api/health.js','runtime':'nodejs24.x','architecture':'x86_64','environment':{},'shouldDisableAutomaticFetchInstrumentation':False,'launcherType':'Nodejs','shouldAddHelpers':True,'shouldAddSourcemapSupport':False,'awsLambdaHandler':''}
        (fn/'.vc-config.json').write_text(json.dumps(config))
        return root,fn,config
    def test_real_cli_output_uses_trusted_publisher_default_region(self):
        with tempfile.TemporaryDirectory() as directory:
            root,_,_=self.output(directory)
            worker.validate_vercel(root)
            with worker.vercel_workspace(root,{'projectId':'prj_test','orgId':'team_test'}) as workspace:
                self.assertEqual(json.loads((workspace/'vercel.json').read_text())['regions'],['fra1'])
                self.assertEqual(json.loads((workspace/'.vercel/output/builds.json').read_text()),{'target':'production','builds':[]})
    def test_explicit_foreign_function_regions_still_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root,fn,config=self.output(directory);config['regions']=['iad1']
            (fn/'.vc-config.json').write_text(json.dumps(config))
            with self.assertRaises(worker.Rejected):worker.validate_vercel(root)

    def test_failed_preview_and_oversized_build_metadata_are_rejected(self):
        for metadata in ({'target':'preview'}, {'target':'production','error':{'message':'failed'}}, {'target':'production','builds':[{'error':'failed'}]}, {'target':'production','argv':['x'*1048576]}):
            with self.subTest(metadata=list(metadata)), tempfile.TemporaryDirectory() as directory:
                root,_,_=self.output(directory)
                (root/'builds.json').write_text(json.dumps(metadata))
                with self.assertRaises(worker.Rejected):worker.validate_vercel(root)
