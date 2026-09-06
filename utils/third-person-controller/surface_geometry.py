"""Convex polygon subtraction for fitting adjoining visual surfaces before UV generation.

Masks are convex, counter-clockwise XZ footprints extruded vertically. Boundary
faces belong to the earlier surface. Physics meshes never pass through this code.
"""
import math

# Blender mesh coordinates are float32. Treat sub-10-micrometre differences as
# the same boundary, in metres rather than the edge-length-dependent cross product.
EPSILON=1e-5

def rectangle(x,z,w,d,margin=0):
    hx,hz=w/2+margin,d/2+margin
    return [(x-hx,z-hz),(x+hx,z-hz),(x+hx,z+hz),(x-hx,z+hz)]

def split_polygon(polygon,a,b):
    length=math.hypot(b[0]-a[0],b[1]-a[1])
    def distance(p):return ((b[0]-a[0])*(p[2]-a[1])-(b[1]-a[1])*(p[0]-a[0]))/length
    values=[distance(p) for p in polygon]
    if min(values)>=-EPSILON:return polygon,[]
    if max(values)<=EPSILON:return [],polygon
    inside=[];outside=[]
    for i,p in enumerate(polygon):
        q=polygon[(i+1)%len(polygon)];dp=values[i];dq=values[(i+1)%len(polygon)]
        if dp>=-EPSILON:inside.append(p)
        if dp<=EPSILON:outside.append(p)
        if (dp>EPSILON and dq<-EPSILON) or (dp<-EPSILON and dq>EPSILON):
            t=dp/(dp-dq);point=tuple(p[c]+t*(q[c]-p[c]) for c in range(3))
            inside.append(point);outside.append(point)
    return inside,outside

def subtract_polygon(polygon,mask):
    # Reject footprints that cannot intersect, before splitting any edges.
    if (max(p[0] for p in polygon)<min(p[0] for p in mask)-EPSILON or
        min(p[0] for p in polygon)>max(p[0] for p in mask)+EPSILON or
        max(p[2] for p in polygon)<min(p[1] for p in mask)-EPSILON or
        min(p[2] for p in polygon)>max(p[1] for p in mask)+EPSILON):return [polygon]
    remaining=polygon;result=[]
    for i,a in enumerate(mask):
        remaining,outside=split_polygon(remaining,a,mask[(i+1)%len(mask)])
        if len(outside)>=3:result.append(outside)
        if len(remaining)<3:break
    return result

def trim_faces(vertices,faces,masks):
    out_vertices=[];out_faces=[];lookup={}
    for face in faces:
        pieces=[[tuple(vertices[i]) for i in face]]
        for mask in masks:
            pieces=[part for polygon in pieces for part in subtract_polygon(polygon,mask)]
        for polygon in pieces:
            indices=[]
            for p in polygon:
                key=tuple(round(c,8) for c in p)
                if key not in lookup:
                    lookup[key]=len(out_vertices);out_vertices.append(p)
                index=lookup[key]
                if not indices or indices[-1]!=index:indices.append(index)
            if len(indices)>1 and indices[0]==indices[-1]:indices.pop()
            if len(set(indices))>=3:out_faces.append(tuple(indices))
    return out_vertices,out_faces
