import hashlib,json,pathlib,subprocess,tempfile,urllib.request,shutil
root=pathlib.Path.cwd()
lock=json.loads((root/'scripts/dictionaries/chinese-sources.json').read_text())
target=json.loads((root/'.migration/target.json').read_text())['tree']
with tempfile.TemporaryDirectory() as tmp:
    paths=[]
    for key,name in [('source','source.jsonl.gz'),('englishSource','ecdict.csv')]:
        dest=pathlib.Path(tmp)/name
        req=urllib.request.Request(lock[key]['url'],headers={'User-Agent':'DeepReader-dictionary-import/1.0'})
        with urllib.request.urlopen(req,timeout=180) as response,dest.open('wb') as output:
            shutil.copyfileobj(response,output)
        if hashlib.sha256(dest.read_bytes()).hexdigest()!=lock[key]['sha256']:
            raise RuntimeError('Source checksum mismatch: '+key)
        paths.append(str(dest))
    subprocess.run(['python','scripts/dictionaries/import-chinese.py',*paths],check=True)
subprocess.run(['node','scripts/dictionaries/verify.mjs'],check=True)
shutil.rmtree(root/'.migration')
(root/'.github/workflows/assemble-chinese.yml').unlink()
subprocess.run(['git','add','-A'],check=True)
actual=subprocess.check_output(['git','write-tree'],text=True).strip()
if actual!=target:raise RuntimeError('Reviewed tree mismatch: '+actual+' != '+target)
print('Verified reviewed tree: '+actual,flush=True)
