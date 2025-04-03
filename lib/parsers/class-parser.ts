/**
 * Parser for MatrUFSC format to our timetable format
 * 
 * This parser converts data from the format generated by MatrUFSC scraper
 * into the format used by our timetable component.
 */

import { Course } from "@/types/curriculum"
import { StudentCourse, CourseStatus } from "@/types/student-plan"

// Basic types
interface ClassSchedule {
  day: number;            // 0-6 for Monday-Sunday
  startTime: string;      // HH:MM format
  endTime: string;        // HH:MM format
  location?: string;      // Classroom building/room
}

interface Professor {
  professorId: string;    // Generated ID
  name: string;           // Professor name
  classNumber: string;    // Class number
  schedule: string;       // Human readable schedule
  enrolledStudents: number;
  maxStudents: number;
}

// Output structure
interface ScheduleData {
  [courseId: string]: ClassSchedule[] | Record<string, Professor[]> | undefined;
  professors: Record<string, Professor[]>;
}

/**
 * Parses a time string from MatrUFSC format
 * Example: "3.1330-2 / CCE101" => { day: 2, startTime: "13:30", endTime: "15:10", location: "CCE101" }
 */
function parseTimeString(timeString: string): ClassSchedule {
  const [timePart, location = ""] = timeString.split(' / ');
  const [dayAndTime, creditsStr = "1"] = timePart.split('-');
  const [dayStr, timeStr] = dayAndTime.split('.');
  
  // Parse day (convert from MatrUFSC format to 0-6 for Mon-Sun)
  const day = parseInt(dayStr) - 2;
  const adjustedDay = day < 0 ? day + 7 : day;
  
  // Format start time
  const startTime = timeStr.substr(0, 2) + ":" + timeStr.substr(2);
  
  // Calculate end time based on credits (each credit = 50 min)
  const credits = parseInt(creditsStr);
  let endTime = startTime;
  
  if (startTime && credits) {
    const [hours, minutes] = startTime.split(':').map(num => parseInt(num));
    const endMinutes = minutes + (credits * 50);
    const endHours = hours + Math.floor(endMinutes / 60);
    const newMinutes = endMinutes % 60;
    endTime = `${endHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
  }
  
  return {
    day: adjustedDay,
    startTime,
    endTime,
    location: location.trim()
  };
}

/**
 * Generate a human-readable schedule string
 */
function generateReadableSchedule(times: ClassSchedule[]): string {
  if (!times.length) return "";

  const daysMap = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const timeGroups: Record<string, {days: number[], location: string}> = {};
  
  // Group times by time slot
  times.forEach(time => {
    const timeKey = `${time.startTime}-${time.endTime}`;
    if (!timeGroups[timeKey]) {
      timeGroups[timeKey] = { days: [], location: time.location || "" };
    }
    timeGroups[timeKey].days.push(time.day);
  });
  
  // Format each time group
  return Object.entries(timeGroups)
    .map(([timeKey, data]) => {
      const [startTime, endTime] = timeKey.split('-');
      const dayNames = data.days.map(day => daysMap[day]).join('/');
      const locationStr = data.location ? ` ${data.location}` : '';
      return `${dayNames} ${startTime}-${endTime}${locationStr}`;
    })
    .join(', ');
}

/**
 * Converts MatrUFSC data into our timetable format
 */
export function parsescheduleData(data: any): ScheduleData {
  // Basic validation of input data
  if (!data || typeof data !== 'object') {
    return { professors: {} };
  }

  const result: ScheduleData = {
    professors: {}
  };
  
  
  // Handle nested structure where degree code is the top level key
  // The structure is: {degreeCode: {DATA: string, FLO: array}}
  for (const degreeCode in data) {
    const degreeData = data[degreeCode];
    
    // Skip if not an object
    if (!degreeData || typeof degreeData !== 'object') {
      continue;
    }
    
    
    // Process the FLO data which is the array of courses
    const campusData = degreeData.FLO;
    
    if (!Array.isArray(campusData)) {
      continue;
    }
    
    
    // Each course entry should be an array
    campusData.forEach(course => {
      if (!Array.isArray(course) || course.length < 4) return;
      
      const courseId = course[0];
      const courseClasses = course[3];
      
      if (!courseId || !Array.isArray(courseClasses)) return;
      
      const courseSchedules: ClassSchedule[] = [];
      const professors: Professor[] = [];
      
      courseClasses.forEach(classInfo => {
        if (!Array.isArray(classInfo) || classInfo.length < 10) return;
        
        const classId = classInfo[0];
        const totalSlots = classInfo[3];
        const filledSlots = classInfo[4];
        const times = classInfo[8];
        const teachers = classInfo[9];
        
        // Process time slots
        const classSchedules: ClassSchedule[] = [];
        
        if (Array.isArray(times)) {
          times.forEach(time => {
            classSchedules.push(parseTimeString(time));
          });
        }
        
        // Add professor info
        const professorId = `${courseId}_${classId}`;
        const professorName = Array.isArray(teachers) ? teachers.join(', ') : "";
        
        professors.push({
          professorId,
          name: professorName,
          classNumber: classId,
          schedule: generateReadableSchedule(classSchedules),
          enrolledStudents: filledSlots,
          maxStudents: totalSlots
        });
        
        // Add schedules to course
        courseSchedules.push(...classSchedules);
      });
      
      // Store data in result
      if (courseSchedules.length > 0) {
        result[courseId] = courseSchedules;
        
        if (professors.length > 0) {
          result.professors[courseId] = professors;
        }
      }
    });
  }
  
  return result;
}

/**
 * Creates student courses from MatrUFSC courses
 */
export function createStudentCoursesFromMatrufsc(
  matrufscCourses: any[],
  status: CourseStatus = CourseStatus.IN_PROGRESS
): StudentCourse[] {
  return matrufscCourses
    .filter(course => Array.isArray(course) && course.length >= 4)
    .map(course => {
      const courseId = course[0];
      const courseTitle = course[2];
      const courseClasses = course[3];
      
      // Get credits from first class
      let credits = 0;
      if (Array.isArray(courseClasses) && courseClasses.length > 0 && Array.isArray(courseClasses[0])) {
        credits = (courseClasses[0][1] as number) / 18;
      }
      
      // Create base course
      const courseObj: Course = {
        id: courseId,
        name: courseTitle,
        credits,
        phase: 0, // Default phase
      };
      
      // Create student course
      return {
        ...courseObj,
        course: courseObj,
        status,
        class: Array.isArray(courseClasses) && courseClasses.length > 0 && Array.isArray(courseClasses[0]) 
          ? courseClasses[0][0] 
          : undefined
      } as StudentCourse;
    });
}

/**
 * Extracts data for a specific campus from MatrUFSC data
 */
export function extractCampusData(data: any, campusCode: string = 'FLO'): any {
  if (!data || typeof data !== 'object') return null;

  // Check if we have a nested structure with degree codes
  const keys = Object.keys(data);
  if (keys.length > 0) {
    const degreeCode = keys[0];
    
    // If the value is an object that has the campus code as a key
    if (data[degreeCode] && typeof data[degreeCode] === 'object' && data[degreeCode][campusCode]) {
      // Return just the campus data
      return { [campusCode]: data[degreeCode][campusCode] };
    }
  }
  
  // If we already have the campus code directly
  if (data[campusCode] && Array.isArray(data[campusCode])) {
    return data;
  }
  
  return null;
} 