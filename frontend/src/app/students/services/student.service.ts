import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Student } from '../interfaces/student.interface';



@Injectable({
  providedIn: 'root'
})
export class StudentService {

  http = inject(HttpClient);

  private apiUrl = environment.API_URL

  getStudentsById = (id: number )=>{
    return this.http.get<Student>(`${this.apiUrl}/api/students/${id}`)
  }

}
