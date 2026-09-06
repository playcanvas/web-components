import unittest

from surface_geometry import rectangle, trim_faces


def area(vertices,faces):
    return sum(abs(sum(vertices[face[i]][0]*vertices[face[(i+1)%len(face)]][2]-
                       vertices[face[(i+1)%len(face)]][0]*vertices[face[i]][2]
                       for i in range(len(face))))/2 for face in faces)


class SurfaceTests(unittest.TestCase):
    def test_nested_cutout_preserves_the_surrounding_deck(self):
        vertices=[(-2,3,-2),(2,3,-2),(2,3,2),(-2,3,2)]
        result,faces=trim_faces(vertices,[(0,1,2,3)],[rectangle(0,0,2,2)])
        self.assertAlmostEqual(area(result,faces),12)
        self.assertTrue(all(p[1]==3 for p in result))
        for face in faces:
            cx=sum(result[i][0] for i in face)/len(face)
            cz=sum(result[i][2] for i in face)/len(face)
            self.assertFalse(-1<cx<1 and -1<cz<1)

    def test_overlapping_cutouts_remove_their_union_only_once(self):
        vertices=[(-3,0,-2),(3,0,-2),(3,0,2),(-3,0,2)]
        result,faces=trim_faces(vertices,[(0,1,2,3)],[rectangle(-.5,0,2,2),rectangle(.5,0,2,2)])
        self.assertAlmostEqual(area(result,faces),18)

    def test_adjacent_decks_keep_their_surface_and_share_a_clean_edge(self):
        vertices=[(0,0,0),(2,0,0),(2,0,2),(0,0,2)]
        result,faces=trim_faces(vertices,[(0,1,2,3)],[rectangle(-1,1,2,2)])
        self.assertAlmostEqual(area(result,faces),4)
        self.assertEqual(set(result),set(vertices))

    def test_a_covered_fascia_is_removed_without_leaving_duplicate_boundary_faces(self):
        vertices=[(0,0,0),(0,3,0),(0,3,2),(0,0,2)]
        result,faces=trim_faces(vertices,[(0,1,2,3)],[rectangle(1,1,2,2)])
        self.assertEqual(faces,[])

    def test_float32_rounding_does_not_leave_an_overlapping_fascia(self):
        vertices=[(2.0000003,0,0),(2.0000003,3,0),(2.0000003,3,2),(2.0000003,0,2)]
        _,faces=trim_faces(vertices,[(0,1,2,3)],[rectangle(1,1,2,2)])
        self.assertEqual(faces,[])

    def test_sloped_face_interpolates_height_without_flattening_it(self):
        vertices=[(-2,-2,-2),(2,2,-2),(2,2,2),(-2,-2,2)]
        result,faces=trim_faces(vertices,[(0,1,2,3)],[rectangle(1,0,2,6)])
        self.assertAlmostEqual(area(result,faces),8)
        self.assertTrue(all(abs(p[0]-p[1])<1e-9 for p in result))


if __name__=='__main__':unittest.main()
