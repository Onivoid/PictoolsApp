import { createMemoryRouter } from "react-router-dom";
import RootLayout from "@/layouts/RootLayout";
import Home from "@/pages/Home";
import Convert from "@/pages/Convert";
import Settings from "@/pages/Settings";

export const router = createMemoryRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: "convert",
        element: <Convert />,
      },
      {
        path: "settings",
        element: <Settings />,
      },
    ],
  },
]);
