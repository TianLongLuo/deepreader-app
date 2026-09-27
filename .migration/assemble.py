import base64,ctypes,gzip,hashlib,io,json,os,pathlib,runpy,shutil,subprocess,tarfile,tempfile,urllib.request,zlib
root=pathlib.Path.cwd()
manifest=json.loads((root/'.migration/assets.json').read_text())
def download(url,dest,sha256=None):
    with urllib.request.urlopen(url,timeout=180) as r,open(dest,'wb') as f:
        shutil.copyfileobj(r,f)
    if sha256 and hashlib.sha256(pathlib.Path(dest).read_bytes()).hexdigest()!=sha256:
        raise RuntimeError('Source checksum mismatch: '+url)
with tempfile.TemporaryDirectory() as temp:
    temp=pathlib.Path(temp)
    # Pin the exact upstream zlib source to reproduce the reviewed gzip bytes.
    download('https://codeload.github.com/madler/zlib/tar.gz/21767c654d31d2dccdde4330529775c6c5fd5389',temp/'zlib.tgz')
    with tarfile.open(temp/'zlib.tgz') as tf:
        tf.extractall(temp,filter='data')
    zd=temp/'zlib-21767c654d31d2dccdde4330529775c6c5fd5389'
    subprocess.run(['./configure','--shared'],cwd=zd,check=True)
    subprocess.run(['make','-j2'],cwd=zd,check=True)
    lib=ctypes.CDLL(str(zd/'libz.so.1.2.12'))
    lib.compressBound.argtypes=[ctypes.c_ulong];lib.compressBound.restype=ctypes.c_ulong
    lib.compress2.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_ulong),ctypes.c_void_p,ctypes.c_ulong,ctypes.c_int]
    lib.compress2.restype=ctypes.c_int
    def exact_gzip(data,compresslevel=9,mtime=0):
        size=ctypes.c_ulong(lib.compressBound(len(data)));buf=ctypes.create_string_buffer(size.value)
        if lib.compress2(buf,ctypes.byref(size),data,len(data),compresslevel)!=0:raise RuntimeError('Compression failed')
        raw=buf.raw[:size.value][2:-4]
        return bytes.fromhex('1f8b08000000000002ff')+raw+(zlib.crc32(data)&0xffffffff).to_bytes(4,'little')+(len(data)&0xffffffff).to_bytes(4,'little')
    gzip.compress=exact_gzip
    lock=json.loads((root/'scripts/dictionaries/sources.json').read_text())
    for lang,source in lock['sources'].items():
        download(source['url'],temp/(lang+'.jsonl'),source['sha256'])
    import sys
    sys.argv=['scripts/dictionaries/import.py',str(temp)]
    runpy.run_path(str(root/'scripts/dictionaries/import.py'),run_name='__main__')
    # Restore reviewed manifest bytes, not generator-dependent formatting.
    subprocess.run(['git','restore','public/dictionaries/'+lock['version']+'/manifest.json'],check=True)
    package=json.loads((root/'package-lock.json').read_text())['packages']['node_modules/pdfjs-dist']
    download(package['resolved'],temp/'pdfjs.tgz')
    digest=base64.b64encode(hashlib.sha512((temp/'pdfjs.tgz').read_bytes()).digest()).decode()
    if 'sha512-'+digest!=package['integrity']:raise RuntimeError('pdfjs package integrity mismatch')
    with tarfile.open(temp/'pdfjs.tgz') as tf:
        for item in manifest['assets']:
            path=item['path']
            if not path.startswith('public/pdfjs/'):continue
            suffix=path.removeprefix('public/pdfjs/')
            f=tf.extractfile('package/'+suffix)
            if f is None:raise RuntimeError('Missing pdfjs asset: '+path)
            target=root/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(f.read())
    for item in manifest['assets']:
        data=(root/item['path']).read_bytes()
        sha=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
        if sha!=item['sha']:raise RuntimeError('Asset mismatch: '+item['path'])
    print('All',len(manifest['assets']),'binary asset hashes match the reviewed local version.')
shutil.rmtree(root/'.migration')
(root/'.github/workflows/assemble-self-hosted-migration.yml').unlink()
subprocess.run(['git','add','-A'],check=True)
tree=subprocess.check_output(['git','write-tree'],text=True).strip()
if tree!=manifest['targetTree']:raise RuntimeError('Final full tree mismatch: '+tree)
print('Final full tree verified:',tree)
