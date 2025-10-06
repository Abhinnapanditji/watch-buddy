import React from 'react'
import Landing from './pages/Landing'
import { createBrowserRouter } from 'react-router-dom';
import Room from './pages/Room';


const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/room/:roomId", element: <Room /> },
]);

export default function App() {
  return <Landing />
}
