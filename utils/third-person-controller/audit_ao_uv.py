"""Raster coverage audit of the uncompressed Blender export's AO atlases."""
import json, struct, sys
from pathlib import Path
import numpy as np

path = Path(sys.argv[1])
data = path.read_bytes();length = struct.unpack_from('<I', data, 12)[0]
gltf = json.loads(data[20:20+length]);binary = memoryview(data)[28+length:]

def read(index):
    a = gltf['accessors'][index];v = gltf['bufferViews'][a['bufferView']]
    dtype = {5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
    size = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    offset = v.get('byteOffset',0)+a.get('byteOffset',0)
    item = np.dtype(dtype).itemsize
    return np.ndarray((a['count'],size),dtype=dtype,buffer=binary,offset=offset,
                      strides=(v.get('byteStride',item*size),item))

atlases = {};resolution = 1024
receivers = 0
for mesh in gltf['meshes']:
    for primitive in mesh['primitives']:
        material = gltf['materials'][primitive['material']]
        ao = material.get('occlusionTexture')
        if not ao:continue
        assert ao.get('texCoord',0) == 1
        uv = read(primitive['attributes']['TEXCOORD_1'])
        assert np.isfinite(uv).all() and uv.min() >= -1e-6 and uv.max() <= 1+1e-6
        image_index = gltf['textures'][ao['index']]['source']
        pixels = atlases.setdefault(image_index,np.zeros((resolution,resolution),np.uint16))
        for face in read(primitive['indices']).reshape(-1,3):
            a,b,c = uv[face]*resolution
            lo = np.maximum(0,np.floor(np.minimum(np.minimum(a,b),c)).astype(int))
            hi = np.minimum(resolution,np.ceil(np.maximum(np.maximum(a,b),c)).astype(int))
            if np.any(hi<=lo):continue
            ab=b-a;ac=c-a;den=ab[0]*ac[1]-ab[1]*ac[0]
            if abs(den)<1e-8:continue
            y,x=np.mgrid[lo[1]:hi[1],lo[0]:hi[0]]
            dx=x+.5-a[0];dy=y+.5-a[1]
            s=(dx*ac[1]-dy*ac[0])/den;t=(ab[0]*dy-ab[1]*dx)/den
            inside=(s>1e-5)&(t>1e-5)&(s+t<1-1e-5)
            pixels[lo[1]:hi[1],lo[0]:hi[0]]+=inside
        receivers+=1
result={'receivers':receivers,'resolution':resolution,'atlases':[]}
for index,pixels in atlases.items():
    overlap=int(np.count_nonzero(pixels>1));covered=int(np.count_nonzero(pixels))
    result['atlases'].append({'texture':index,'covered':covered,'overlapping':overlap})
    assert overlap==0, f'AO atlas {index}: {overlap} overlapping texel samples'
assert receivers==39 and len(atlases)==5
print(json.dumps(result,indent=2))
