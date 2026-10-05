import { Route, Routes } from "react-router";
import AdminActivities from "./pages/admin/AdminActivities";
import AdminChores from "./pages/admin/AdminChores";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminMenus from "./pages/admin/AdminMenus";
import AdminPersons from "./pages/admin/AdminPersons";
import AdminRooms from "./pages/admin/AdminRooms";
import AdminStay from "./pages/admin/AdminStay";
import Chores from "./pages/Chores";
import Home from "./pages/Home";
import Meals from "./pages/Meals";
import Me from "./pages/Me";
import Planning from "./pages/Planning";
import Presences from "./pages/Presences";
import Print from "./pages/Print";
import PrintMenu from "./pages/PrintMenu";
import Rooms from "./pages/Rooms";
import StayLayout from "./pages/StayLayout";
import { Toaster } from "./toast";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/s/:slug" element={<StayLayout />}>
          <Route index element={<Me />} />
          <Route path="planning" element={<Planning />} />
          <Route path="repas" element={<Meals />} />
          <Route path="corvees" element={<Chores />} />
          <Route path="presences" element={<Presences />} />
          <Route path="chambres" element={<Rooms />} />
          <Route path="imprimer" element={<PrintMenu />} />
          <Route path="imprimer/:kind" element={<Print />} />
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminStay />} />
            <Route path="personnes" element={<AdminPersons />} />
            <Route path="chambres" element={<AdminRooms />} />
            <Route path="corvees" element={<AdminChores />} />
            <Route path="activites" element={<AdminActivities />} />
            <Route path="menus" element={<AdminMenus />} />
          </Route>
        </Route>
        <Route path="*" element={<Home />} />
      </Routes>
      <Toaster />
    </>
  );
}
