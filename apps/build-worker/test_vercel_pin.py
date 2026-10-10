import unittest
from pathlib import Path
import guest
import publisher

class VercelPinTests(unittest.TestCase):
    def test_pin_matches_guest_publisher_install_and_documented_node24_verified_version(self):
        root=Path(__file__).parent
        self.assertEqual(guest.VERCEL_VERSION,'63.1.2')
        self.assertEqual(publisher.VERCEL_VERSION,guest.VERCEL_VERSION)
        for name in ('install-guest.sh','README.md'):
            self.assertIn(guest.VERCEL_VERSION,(root/name).read_text())
            self.assertNotIn('48.8.0',(root/name).read_text())
        self.assertIn("getSupportedNodeVersion('24.x')",(root/'install-guest.sh').read_text())
        self.assertIn('14.20.1',(root/'README.md').read_text())
