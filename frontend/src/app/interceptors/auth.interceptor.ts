import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const studentToken = localStorage.getItem('sigba_student_token');
  const adminToken = localStorage.getItem('sigba_admin_token');
  const token = studentToken || adminToken;

  if (token) {
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
    return next(authReq);
  }

  return next(req);
};
