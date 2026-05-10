import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Spin } from 'antd';

const GisOutlet = () => (
  <Suspense
    fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    }
  >
    <Outlet />
  </Suspense>
);

export default GisOutlet;
