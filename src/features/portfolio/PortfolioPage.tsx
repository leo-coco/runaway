import { Navigate, useParams } from 'react-router-dom';

/** Back-compat redirect: the old single page is now split into Dashboard / Projection / Monte Carlo. */
export const PortfolioPage = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/plan/${id}/dashboard` : '/plans'} replace />;
};
