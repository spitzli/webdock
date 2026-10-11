import unittest
from datetime import datetime, timezone, timedelta
from mail_configuration import validate_configuration, apply_configuration


def packet():
    return {'version': 3,'submission':None, 'customerID': '123', 'clusterID': '789', 'operationID': '456', 'generation': 1,
            'revision': '1', 'leaseToken': 'a' * 43, 'leaseUntil': (datetime.now(timezone.utc) + timedelta(seconds=100)).isoformat(),
            'hostname': 'mail-123.example.com', 'credentials': {'username': 'admin', 'password': 'fixture'},
            'domains': [{'id': '11', 'name': 'customer.example.com', 'providerId': None, 'ownershipVerified': True}],
            'mailboxes': [{'id': '22', 'domainId': '11', 'localPart': 'support', 'quotaBytes': 1048576, 'providerId': None}],
            'identities': [{'id': '33', 'subject': '44', 'providerId': None, 'enabled': True, 'mailboxIds': ['22'], 'username': 'wd-33@mail-123.example.com', 'password': 'fixture-user-secret'}]}


class MailConfigurationTests(unittest.TestCase):
    def test_configuration_rejects_foreign_identity_domain_and_arbitrary_fields(self):
        value = packet(); validate_configuration(value)
        for change in [{'hostname': 'other.example.com'}, {'customerID': '../other'}, {'shell': 'whoami'}]:
            with self.assertRaises(ValueError): validate_configuration({**packet(), **change})
        value = packet(); value['identities'][0]['username'] = 'admin'
        with self.assertRaises(ValueError): validate_configuration(value)
        value = packet(); value['mailboxes'][0]['domainId'] = '99'
        with self.assertRaises(ValueError): validate_configuration(value)

    def test_existing_unowned_account_is_never_adopted_or_overwritten(self):
        class Client:
            def call(self, method, args):
                if method == 'x:Domain/get': return {'list': [{'id':'d0','name':'mail-123.example.com'}, {'id':'d1','name':'customer.example.com'}]}
                if method == 'x:Account/query': return {'ids':['foreign'], 'total':1}
                if method == 'x:Account/get': return {'list':[{'id':'foreign','@type':'Group','name':'support','domainId':'d1','description':'Somebody else'}]}
                raise AssertionError('Unexpected external write')
        with self.assertRaisesRegex(ValueError, 'ownership'):
            apply_configuration(Client(), packet(), lambda: None)

    def test_interactive_identities_cannot_bypass_native_send_policy(self):
        from mail_configuration import MAIL_PERMISSIONS
        for permission in ['emailSend', 'jmapEmailSubmissionCreate', 'imapAuthenticate', 'sieveAuthenticate', 'jmapSieveScriptCreate']:
            self.assertNotIn(permission, MAIL_PERMISSIONS)
