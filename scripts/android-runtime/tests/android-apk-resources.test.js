import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('rejects v2-only and invalid release signatures and explicitly verifies the v1 signature', () => {
  const result = spawnSync('python', ['-c', String.raw`
import ast,re,subprocess
from pathlib import Path
from unittest.mock import patch
tree=ast.parse(Path('scripts/android-runtime/check-apk.py').read_text())
function=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='verify_release_signatures')
scope={'re':re,'subprocess':subprocess}
exec(compile(ast.Module(body=[function],type_ignores=[]),'signature-checker','exec'),scope)
def output(schemes):
    return '\n'.join('Verified using '+scheme+' scheme (APK signing): '+str(scheme in schemes).lower() for scheme in ['v1','v2','v3'])+'\n'
with patch.object(subprocess,'run') as run:
    run.return_value=subprocess.CompletedProcess([],0,output({'v1','v2','v3'}),'')
    scope['verify_release_signatures']('synthetic.apk','apksigner')
    assert run.call_args.args[0]==['apksigner','verify','--verbose','--min-sdk-version','23','synthetic.apk']
    for status,stdout,stderr in [(0,output({'v2'}),''),(0,output({'v1','v2'})+'Verified using v3.1 scheme (APK signing): true\n',''),(1,output({'v1','v2','v3'}),'APK content digest did not verify')]:
        run.return_value=subprocess.CompletedProcess([],status,stdout,stderr)
        try:
            scope['verify_release_signatures']('synthetic.apk','apksigner')
        except ValueError:
            pass
        else:
            raise AssertionError('Incomplete or invalid release signatures accepted')
`], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(0);
});

it('checks official resource identities and preserves visible pixels after release PNG optimization', () => {
  const result = spawnSync('python', ['-c', String.raw`
import ast,re
from pathlib import Path
from PIL import Image
tree=ast.parse(Path('scripts/android-runtime/check-apk.py').read_text())
functions=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in ('resource_file_path','rendered_image_bytes')]
scope={'re':re}
exec(compile(ast.Module(body=functions,type_ignores=[]),'checker-functions','exec'),scope)
table='  resource 0x7f040000 drawable/eleckoi_app_icon\n    (nodpi) (file) res/x1.png type=PNG\n  resource 0x7f040001 drawable/other\n    (nodpi) (file) res/y1.png type=PNG\n'
assert scope['resource_file_path'](table,'drawable/eleckoi_app_icon')=='res/x1.png'
for invalid in [table.replace('drawable/eleckoi_app_icon','drawable/other'), table+table]:
    try:
        scope['resource_file_path'](invalid,'drawable/eleckoi_app_icon')
    except ValueError:
        pass
    else:
        raise AssertionError('Unknown or duplicate icon resource accepted')
source=Image.new('RGBA',(2,1))
source.putdata([(1,2,3,0),(100,101,102,128)])
packed=Image.new('RGBA',(2,1))
packed.putdata([(0,0,0,0),(100,101,102,128)])
assert source.tobytes()!=packed.tobytes()
assert scope['rendered_image_bytes'](source)==scope['rendered_image_bytes'](packed)
packed.putpixel((1,0),(99,101,102,128))
assert scope['rendered_image_bytes'](source)!=scope['rendered_image_bytes'](packed)
packed.putpixel((1,0),(100,101,102,127))
assert scope['rendered_image_bytes'](source)!=scope['rendered_image_bytes'](packed)
`], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(0);
});
