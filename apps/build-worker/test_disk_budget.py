import tempfile
from pathlib import Path
from unittest.mock import patch
import unittest
import worker

class DiskBudgetTests(unittest.TestCase):
    def test_both_qemu_files_and_all_staging_copies_fit_aggregate_budget(self):
        with tempfile.TemporaryDirectory() as directory:
            image=Path(directory)/'base.raw';image.write_bytes(b'base')
            budget=5*1024**3
            cap=worker.execution_disk_limit(image,budget)
            self.assertLessEqual(2*cap+worker.BUILD_STAGING_RESERVE+4*50000*4096,budget)
            self.assertGreaterEqual(cap,worker.MAX_OUTPUT)
            with self.assertRaises(worker.Rejected):worker.execution_disk_limit(image,worker.BUILD_STAGING_RESERVE)
    def test_image_too_large_for_budget_is_rejected_before_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            image=Path(directory)/'base.raw'
            with image.open('wb') as f:f.truncate(4*1024**3)
            with self.assertRaises(worker.Rejected):worker.execution_disk_limit(image,8*1024**3)
    def test_scheduler_alternates_builds_and_approved_releases_under_backlog(self):
        import publisher
        calls=[]
        with patch.object(worker,'run_once',side_effect=lambda _:calls.append('build') or True),patch.object(publisher,'run_once',side_effect=lambda *_:calls.append('release') or True),patch.object(worker,'Control'):
            worker.run_turn({},False);worker.run_turn({},True);worker.run_turn({},False);worker.run_turn({},True)
        self.assertEqual(calls,['build','release','build','release'])

class RetentionTests(unittest.TestCase):
    def test_only_exact_server_selected_artifact_is_deleted(self):
        key='1/2/3/'+'a'*64+'.tar'
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);target=root/key;target.parent.mkdir(parents=True);target.write_bytes(b'expired')
            keep=target.with_name('b'*64+'.tar');keep.write_bytes(b'retain')
            control=unittest.mock.Mock();control.request.return_value={'storageKeys':[key]}
            worker.cleanup_artifacts({'artifactRoot':directory},control)
            self.assertEqual(control.request.call_args_list[0],unittest.mock.call('/retention',{}))
            self.assertEqual(control.request.call_args_list[1],unittest.mock.call('/retention-complete',{'storageKeys':[key]}))
            self.assertFalse(target.exists());self.assertTrue(keep.exists());self.assertTrue(target.parent.exists())
            worker.cleanup_artifacts({'artifactRoot':directory},control)
    def test_retention_rejects_traversal_and_symlinked_directories(self):
        with tempfile.TemporaryDirectory() as directory,tempfile.TemporaryDirectory() as outside:
            root=Path(directory);(root/'1').symlink_to(outside,target_is_directory=True)
            for key in ('../outside','1/2/3/'+'a'*64+'.tar'):
                control=unittest.mock.Mock();control.request.return_value={'storageKeys':[key]}
                with self.assertRaises(worker.Rejected):worker.cleanup_artifacts({'artifactRoot':directory},control)

class OrphanRetentionTests(unittest.TestCase):
    def test_orphans_require_age_and_explicit_subset_approval(self):
        import os,time
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);prefix=root/'1/2/3';prefix.mkdir(parents=True)
            old=prefix/('a'*64+'.tar');old.write_bytes(b'old');os.utime(old,(time.time()-90000,time.time()-90000))
            retained=prefix/('b'*64+'.tar');retained.write_bytes(b'keep');os.utime(retained,(time.time()-90000,time.time()-90000))
            fresh=prefix/('c'*64+'.tar');fresh.write_bytes(b'fresh')
            link=prefix/('d'*64+'.tar');link.symlink_to(old)
            control=unittest.mock.Mock();control.request.return_value={'storageKeys':[str(old.relative_to(root))]}
            worker.cleanup_orphan_artifacts({'artifactRoot':directory},control)
            request=control.request.call_args
            self.assertEqual(request.args[0],'/orphan-retention')
            self.assertEqual(set(request.args[1]['storageKeys']),{str(old.relative_to(root)),str(retained.relative_to(root))})
            self.assertFalse(old.exists());self.assertTrue(retained.exists());self.assertTrue(fresh.exists());self.assertTrue(link.is_symlink())
    def test_provider_cannot_delete_unrequested_orphan_key(self):
        import os,time
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);prefix=root/'1/2/3';prefix.mkdir(parents=True)
            old=prefix/('a'*64+'.tar');old.write_bytes(b'old');os.utime(old,(time.time()-90000,time.time()-90000))
            fresh=prefix/('b'*64+'.tar');fresh.write_bytes(b'fresh')
            control=unittest.mock.Mock();control.request.return_value={'storageKeys':[str(fresh.relative_to(root))]}
            with self.assertRaises(worker.Rejected):worker.cleanup_orphan_artifacts({'artifactRoot':directory},control)
            self.assertTrue(old.exists());self.assertTrue(fresh.exists())
    def test_large_retained_prefix_does_not_starve_later_orphans(self):
        import os,time
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);prefix=root/'1/2/3';prefix.mkdir(parents=True)
            for i in range(1001):
                path=prefix/(format(i,'064x')+'.tar');path.write_bytes(b'x');os.utime(path,(time.time()-90000,time.time()-90000))
            control=unittest.mock.Mock();control.request.return_value={'storageKeys':[]}
            worker.cleanup_orphan_artifacts({'artifactRoot':directory},control)
            first=control.request.call_args.args[1]['storageKeys'];self.assertEqual(len(first),1000)
            worker.cleanup_orphan_artifacts({'artifactRoot':directory},control)
            second=control.request.call_args.args[1]['storageKeys'];self.assertEqual(len(second),1);self.assertNotIn(second[0],first)
