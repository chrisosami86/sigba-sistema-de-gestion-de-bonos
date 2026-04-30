import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Student } from '../interfaces/student.interface';

@Injectable({
  providedIn: 'root'
})
export class StudentService {
  http = inject(HttpClient);

  login = (user: Student) => {
    if(!user) return
    return this.http.post('http://localhost:3000/api/login', user);
  }
}
