import { Routes } from '@angular/router';
import { LoginStudentsPage } from './students/pages/login-students-page/login-students-page';
import { DetailsStudentsPage } from './students/pages/details-students-page/details-students-page';
import { studentAuthGuard } from './students/guards/student-auth.guard';
import { AdminLoginPage } from './admin/pages/admin-login-page/admin-login-page';
import { AdminDashboardPage } from './admin/pages/admin-dashboard-page/admin-dashboard-page';
import { AdminScanPage } from './admin/pages/admin-scan-page/admin-scan-page';
import { InstitutionalDashboardPage } from './admin/pages/institutional-dashboard-page/institutional-dashboard-page';
import { adminAuthGuard } from './admin/guards/admin-auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: LoginStudentsPage,
  },
  {
    path: 'details',
    component: DetailsStudentsPage,
    canActivate: [studentAuthGuard],
  },
  {
    path: 'students/:id',
    redirectTo: '',
  },
  {
    path: 'admin/login',
    component: AdminLoginPage,
  },
  {
    path: 'admin',
    component: AdminDashboardPage,
    canActivate: [adminAuthGuard],
  },
  {
    path: 'admin/scan',
    component: AdminScanPage,
    canActivate: [adminAuthGuard],
  },
  {
    path: 'admin/institutional',
    component: InstitutionalDashboardPage,
    canActivate: [adminAuthGuard],
  },
  {
    path: '**',
    redirectTo: ''
  }
];
