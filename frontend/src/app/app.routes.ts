import { Routes } from '@angular/router';
import { LoginStudentsPage } from './students/pages/login-students-page/login-students-page';
import { DetailsStudentsPage } from './students/pages/details-students-page/details-students-page';

export const routes: Routes = [
  {
    path:'',
    component: LoginStudentsPage
  },
   {
    path:'details',
    component: DetailsStudentsPage
  },
  {
  path: 'students/:id',
  component: DetailsStudentsPage
}
];
