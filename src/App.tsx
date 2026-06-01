import { useState } from 'react';
import { RouterProvider } from '@tanstack/react-router';

import { getRouter } from './router';

export default function App() {
  const [router] = useState(() => getRouter());

  return <RouterProvider router={router} />;
}
