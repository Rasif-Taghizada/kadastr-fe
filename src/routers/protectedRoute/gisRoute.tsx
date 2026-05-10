import React from 'react';
import { Navigate } from 'react-router-dom';

interface GisRouteProps {
  children: React.ReactNode;
}

const GisRoute: React.FC<GisRouteProps> = ({ children }) => {
  const token = localStorage.getItem('access_token');
  if (!token) return <Navigate to="/auth/signin" replace />;
  return <>{children}</>;
};

export default GisRoute;
