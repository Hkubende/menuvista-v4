import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import Dashboard from "./pages/Dashboard";
import ARViewer from "./pages/ARViewer";
import MenuItemPage from "./pages/MenuItemPage";
import Checkout from "./pages/Checkout";
import Orders from "./pages/Orders";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/menu/:dishId" element={<MenuItemPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/ar" element={<ARViewer />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/orders" element={<Orders />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
