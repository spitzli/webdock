"""Render/install narrow DB admission rules while preserving the existing App rules."""
import argparse
import copy
import json
from pathlib import Path
import subprocess


def application_patch(policy):
    selector=copy.deepcopy(policy['spec']['matchConstraints'].get('namespaceSelector',{}))
    expressions=selector.get('matchExpressions',[])
    names=next((e for e in expressions if e.get('key')=='kubernetes.io/metadata.name' and e.get('operator')=='NotIn'),None)
    if names is None:raise ValueError('Unexpected application admission policy; review before changing its boundary')
    if 'cnpg-system' not in names['values']:names['values'].append('cnpg-system')
    exclusion={'key':'webdock.dev/workload-class','operator':'NotIn','values':['database']}
    if exclusion not in expressions:expressions.append(exclusion)
    selector['matchExpressions']=expressions
    return [{'op':'test','path':'/metadata/resourceVersion','value':policy['metadata']['resourceVersion']},
            {'op':'replace','path':'/spec/matchConstraints/namespaceSelector','value':selector}]


def documents(images):
    owned="namespaceObject.metadata.name.matches('^wd-db-[1-9][0-9]{0,18}$')"
    approved=json.dumps(images)
    container=f"has(c.image) && c.image in {approved} && has(c.securityContext) && c.securityContext.readOnlyRootFilesystem == true && has(c.resources) && has(dyn(c.resources).requests) && has(dyn(c.resources).limits) && ['cpu','memory','ephemeral-storage'].all(r, r in dyn(c.resources).requests && r in dyn(c.resources).limits && quantity(dyn(c.resources).requests[r]).isGreaterThan(quantity('0')) && quantity(dyn(c.resources).limits[r]).isGreaterThan(quantity('0')))"
    checks={
      'pods':[
        (owned,'Database namespaces must use the generated installation identity.'),
        ('object.spec.containers.all(c, '+container+') && (!has(object.spec.initContainers) || object.spec.initContainers.all(c, '+container+'))','Database containers require approved immutable images, read-only roots and finite resources.'),
        ("!has(object.spec.volumes) || object.spec.volumes.all(v, !has(v.persistentVolumeClaim) || v.persistentVolumeClaim.claimName == 'postgres-1')",'Database pods may use only their installation PVC.'),
        ("!has(object.spec.ephemeralContainers) || size(object.spec.ephemeralContainers)==0",'Database debug containers require a separate reviewed operator procedure.'),
      ],
      'services':[
        (owned,'Database namespaces must use the generated installation identity.'),
        ("object.spec.type in ['ClusterIP','NodePort'] && (!has(object.spec.externalIPs) || size(object.spec.externalIPs)==0)",'Database services may not use external IPs or LoadBalancers.'),
        ("object.spec.type != 'NodePort' || (has(object.metadata.labels) && 'webdock.dev/database-installation' in object.metadata.labels && 'wd-db-'+object.metadata.labels['webdock.dev/database-installation']==namespaceObject.metadata.name && object.spec.ports.all(p, has(p.nodePort) && p.nodePort>=32000 && p.nodePort<=32199 && p.port==5432 && p.protocol=='TCP'))",'Database NodePorts require an owned installation and the reserved port range.'),
      ]}
    result=[]
    for resource,rules in checks.items():
        name='webdock-database-'+resource
        result.append({'apiVersion':'admissionregistration.k8s.io/v1','kind':'ValidatingAdmissionPolicy','metadata':{'name':name,'labels':{'webdock.dev/database-boundary-version':'1'}},'spec':{
            'failurePolicy':'Fail','matchConstraints':{'namespaceSelector':{'matchLabels':{'webdock.dev/workload-class':'database'}},
             'resourceRules':[{'apiGroups':[''],'apiVersions':['v1'],'operations':['CREATE','UPDATE'],'resources':[resource],'scope':'Namespaced'}]},
            'validations':[{'expression':expression,'message':message} for expression,message in rules]}})
        result.append({'apiVersion':'admissionregistration.k8s.io/v1','kind':'ValidatingAdmissionPolicyBinding','metadata':{'name':name},'spec':{'policyName':name,'validationActions':['Deny']}})
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--kubeconfig',required=True);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    values=dict(line.split('=',1) for line in Path(__file__).with_name('versions.env').read_text().splitlines() if line and not line.startswith('#'))
    items=documents([values[k] for k in ['CNPG_IMAGE','POSTGRES_IMAGE','PGBOUNCER_IMAGE']])
    command=['kubectl','--kubeconfig',args.kubeconfig]
    policies=[json.loads(subprocess.check_output(command+['get','validatingadmissionpolicy',name,'-o','json'])) for name in ['webdock-application-safety','webdock-service-safety']]
    patches=[application_patch(policy) for policy in policies]
    if not args.apply:
        print(json.dumps({'databasePolicies':items,'applicationPatches':[{'name':p['metadata']['name'],'patch':patch} for p,patch in zip(policies,patches)]},indent=2));return
    # Install the restrictive replacement boundary before exempting database namespaces.
    subprocess.run(command+['apply','--server-side','--field-manager=webdock-postgres-boundary','-f','-'],input=json.dumps({'apiVersion':'v1','kind':'List','items':items}),text=True,check=True)
    for policy,patch in zip(policies,patches):
        subprocess.run(command+['patch','validatingadmissionpolicy',policy['metadata']['name'],'--type=json','-p',json.dumps(patch)],check=True)


if __name__=='__main__':main()
