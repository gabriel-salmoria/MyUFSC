"use client";

import { useMemo, useState, useEffect } from "react";
import { cn } from "@/components/ui/utils";
import CourseStats from "./course-stats";
import type { Course } from "@/types/curriculum";
import type { StudentInfo, StudentCourse, CustomScheduleEntry } from "@/types/student-plan";
import type { ViewStudentCourse } from "@/types/visualization";
import type { ScheduleHookState } from "@/hooks/setup/UseSchedule";
import { CourseStatus } from "@/types/student-plan";
import { TIMETABLE } from "@/styles/visualization";
import {
  CSS_CLASSES,
  TIMETABLE_COLOR_CLASSES,
  STATUS_CLASSES,
} from "@/styles/course-theme";
import { parsescheduleData } from "@/parsers/class-parser";
import { useStudentStore } from "@/lib/student-store";
import { useCourseMap } from "@/hooks/useCourseMap";

import TimetableHeader from "./timetable-header";
import TimetableGrid from "./timetable-grid";
import CustomEventModal from "./custom-event-modal";
import { ProfessorDetailsDialog } from "@/components/professors/professor-details-dialog";
import { fetchProfessorAggregates } from "@/lib/professors-client";
import { CalendarPlus2 } from "lucide-react";

const TIMETABLE_COLORS = TIMETABLE_COLOR_CLASSES;

const emptyScheduleData = {
  professors: {},
};

interface TimetableProps {
  studentInfo: StudentInfo;
  scheduleState: ScheduleHookState;
  setScheduleState: React.Dispatch<React.SetStateAction<ScheduleHookState>>;
}

type ScheduleEntry = {
  day: number;
  startTime: string;
  endTime?: string;
  location?: string;
};

type ProfessorOverride = {
  courseId: string;
  professorId: string;
  schedule: ScheduleEntry[];
  classNumber: string;
  location: string;
};

interface Professor {
  professorId: string;
  name: string;
  classNumber: string;
  schedule: string;
  enrolledStudents: number;
  maxStudents: number;
}

interface ScheduleData {
  [courseId: string]: ScheduleEntry[] | { [key: string]: Professor[] };
  professors: {
    [courseId: string]: Professor[];
  };
}

type ConflictKey = `${string}-${number}-${string}`;
type ConflictMap = Map<ConflictKey, Set<string>>;

// ─── Modal state ─────────────────────────────────────────────────────────────

interface ModalState {
  open: boolean;
  prefill: Partial<CustomScheduleEntry>;
  editing: boolean;
}

const closedModal: ModalState = { open: false, prefill: {}, editing: false };

// ─────────────────────────────────────────────────────────────────────────────

export default function Timetable({
  studentInfo,
  scheduleState,
  setScheduleState,
}: TimetableProps) {
  const [professorOverrides, setProfessorOverrides] = useState<
    ProfessorOverride[]
  >([]);

  const courseMap = useCourseMap();
  const addCustomScheduleEntry = useStudentStore((s) => s.addCustomScheduleEntry);
  const removeCustomScheduleEntry = useStudentStore((s) => s.removeCustomScheduleEntry);
  const updateCustomScheduleEntry = useStudentStore((s) => s.updateCustomScheduleEntry);
  const setCourseClass = useStudentStore((s) => s.setCourseClass);

  const customScheduleEntries = studentInfo?.customScheduleEntries || [];

  const {
    scheduleData,
    selectedCampus,
    selectedSemester,
    availableSemesters,
    isLoading: isLoadingscheduleData,
  } = scheduleState;

  const onCampusChange = (campus: string) =>
    setScheduleState((prev) => ({ ...prev, selectedCampus: campus }));

  const onSemesterChange = (semester: string) =>
    setScheduleState((prev) => ({
      ...prev,
      selectedSemester: semester,
    }));

  const [selectedPhase, setSelectedPhase] = useState<number>(1);
  const [courseColors] = useState(() => new Map<string, string>());
  const [conflicts, setConflicts] = useState<Map<string, Set<string>>>(
    new Map(),
  );

  const [professorAggregates, setProfessorAggregates] = useState<
    Record<string, any>
  >({});
  const [detailsProfessorId, setDetailsProfessorId] = useState<string | null>(
    null,
  );
  const [searchRefreshTrigger, setSearchRefreshTrigger] = useState(0);

  // ─── Modal state ───────────────────────────────────────────────────────────
  const [modalState, setModalState] = useState<ModalState>(closedModal);
  const [lastEntry, setLastEntry] =
    useState<Partial<CustomScheduleEntry> | null>(null);

  const openNewEntry = (day: number, slotId: string) =>
    setModalState({
      open: true,
      editing: false,
      prefill: { day, startTime: slotId },
    });

  const openEditEntry = (entry: CustomScheduleEntry) =>
    setModalState({ open: true, editing: true, prefill: entry });

  const handleSave = (entry: CustomScheduleEntry) => {
    if (modalState.editing) {
      updateCustomScheduleEntry(entry);
    } else {
      addCustomScheduleEntry(entry);
    }
    setLastEntry(entry);
  };

  // ─── Derive visible custom entries for the current phase ──────────────────
  const visibleCustomEntries = useMemo(
    () =>
      customScheduleEntries.filter(
        (e) => e.recurring || e.scopedToPhase === selectedPhase,
      ),
    [customScheduleEntries, selectedPhase],
  );

  // ─── Academic plan data ───────────────────────────────────────────────────
  let plan = studentInfo.plans[studentInfo.currentPlan];
  if (!studentInfo || !plan || !plan.semesters) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-4 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-foreground">
          Class Schedule
        </h2>
        <div className="flex items-center justify-center h-[200px]">
          <p className="text-muted-foreground">
            Loading class schedule data...
          </p>
        </div>
      </div>
    );
  }

  const timetableData = useMemo(() => {
    if (scheduleData) {
      return parsescheduleData(scheduleData);
    }
    return emptyScheduleData as ScheduleData;
  }, [scheduleData]);

  const selectedPhaseCourses = useMemo(() => {
    if (!studentInfo?.plans[studentInfo.currentPlan]) return [];
    const semester = studentInfo.plans[studentInfo.currentPlan]?.semesters.find(
      (s) => s.number === selectedPhase,
    );
    if (!semester) return [];
    return semester.courses;
  }, [studentInfo, selectedPhase]);

  const scheduledCourses = useMemo(() => {
    return selectedPhaseCourses.filter((course) => {
      const hasOverride = professorOverrides.some(
        (o) => o.courseId === course.courseId,
      );
      return hasOverride;
    });
  }, [selectedPhaseCourses, professorOverrides]);

  const [aggregatesRefreshKey, setAggregatesRefreshKey] = useState(0);

  const scheduledCourseIdsKey = scheduledCourses.map((c) => c.courseId).sort().join(",");
  useEffect(() => {
    const courseIds = scheduledCourseIdsKey ? scheduledCourseIdsKey.split(",") : [];
    if (courseIds.length > 0) {
      fetchProfessorAggregates(courseIds)
        .then((data) => setProfessorAggregates(data))
        .catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledCourseIdsKey, aggregatesRefreshKey]);

  const handleProfessorClick = (professorName: string) => {
    setDetailsProfessorId(professorName);
  };

  const knownTaughtCourses = useMemo(() => {
    if (!detailsProfessorId || !timetableData?.professors) return [];
    const norm = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();
    const targetNorm = norm(detailsProfessorId);
    const courses = [];
    for (const [courseId, profs] of Object.entries(timetableData.professors)) {
      if (
        Array.isArray(profs) &&
        profs.some((p: any) => {
          // p.name may be "Prof A, Prof B" for multi-teacher classes
          const names = p.name.split(",").map((n: string) => n.trim());
          return names.some(
            (n: string) => n === detailsProfessorId || norm(n) === targetNorm,
          );
        })
      ) {
        courses.push(courseId);
      }
    }
    return courses;
  }, [detailsProfessorId, timetableData]);

  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const parseScheduleForProfessor = (
    professorData: Professor,
    course: StudentCourse,
  ): ProfessorOverride | null => {
    const scheduleText = professorData.schedule;
    const scheduleEntries: ScheduleEntry[] = [];
    const courseId = course.courseId;

    if (scheduleText) {
      const timeSlots = scheduleText.split(",").map((s) => s.trim());
      timeSlots.forEach((timeSlot) => {
        const daysAndTimeMatch = timeSlot.match(
          /^(.+?) (\d+:\d+-\d+:\d+)(.*)$/,
        );
        if (daysAndTimeMatch) {
          const [_, daysStr, timeRange, locationPart] = daysAndTimeMatch;
          const days = daysStr.split("/");
          const [startTime, endTime] = timeRange.split("-");
          const slotLocation = locationPart ? locationPart.trim() : "";

          days.forEach((dayName) => {
            const dayIndex =
              TIMETABLE.DAYS_MAP[
                dayName.trim() as keyof typeof TIMETABLE.DAYS_MAP
              ];
            if (dayIndex === undefined || !startTime || !endTime) return;
            scheduleEntries.push({
              day: dayIndex,
              startTime,
              endTime,
              location: slotLocation,
            });
          });
        }
      });
    }

    return {
      courseId,
      professorId: professorData.professorId,
      schedule: scheduleEntries,
      classNumber: professorData.classNumber,
      location: scheduleEntries[scheduleEntries.length - 1]?.location || "",
    };
  };

  useEffect(() => {
    if (!timetableData || !selectedPhaseCourses) return;
    const newOverrides: ProfessorOverride[] = [];

    selectedPhaseCourses.forEach((studentCourse) => {
      const classId = (studentCourse as any).class;
      const courseId = studentCourse.courseId;
      if (classId) {
        const profs = timetableData.professors[courseId];
        if (profs) {
          const prof = profs.find((p: Professor) => p.classNumber === classId);
          if (prof) {
            const override = parseScheduleForProfessor(prof, studentCourse);
            if (override) newOverrides.push(override);
          }
        }
      }
    });

    const newConflicts = new Map<string, Set<string>>();
    for (let i = 0; i < newOverrides.length; i++) {
      for (let j = i + 1; j < newOverrides.length; j++) {
        const o1 = newOverrides[i];
        const o2 = newOverrides[j];
        o1.schedule.forEach((e1) => {
          if (!e1.endTime) return;
          o2.schedule.forEach((e2) => {
            if (!e2.endTime || e1.day !== e2.day) return;
            const s1 = timeToMinutes(e1.startTime);
            const end1 = timeToMinutes(e1.endTime as string);
            const s2 = timeToMinutes(e2.startTime);
            const end2 = timeToMinutes(e2.endTime as string);
            if (
              (s1 >= s2 && s1 < end2) ||
              (end1 > s2 && end1 <= end2) ||
              (s1 < s2 && end1 > end2)
            ) {
              const k1 = `${o1.courseId}-${e1.day}-${e1.startTime}`;
              const k2 = `${o2.courseId}-${e2.day}-${e2.startTime}`;
              if (!newConflicts.has(k1)) newConflicts.set(k1, new Set());
              if (!newConflicts.has(k2)) newConflicts.set(k2, new Set());
              newConflicts.get(k1)!.add(o2.courseId);
              newConflicts.get(k2)!.add(o1.courseId);
            }
          });
        });
      }
    }

    setProfessorOverrides(newOverrides);
    setConflicts(newConflicts);
  }, [selectedPhaseCourses, timetableData]);

  const handleProfessorSelect = (
    course: StudentCourse,
    professorId: string,
  ) => {
    const courseId = course.courseId;
    const professorsForCourse = timetableData.professors[courseId];
    const professorData = professorsForCourse?.find(
      (p) => p.professorId === professorId,
    );
    if (professorData) {
      setCourseClass(course, professorData.classNumber);
    }
  };

  // ─── Build course schedule grid (now includes customEntries per cell) ──────
  const courseSchedule = useMemo(() => {
    const schedule: Record<
      string,
      Record<
        string,
        {
          courses: {
            course: ViewStudentCourse;
            isConflicting: boolean;
            location?: string;
          }[];
          customEntries: CustomScheduleEntry[];
        }
      >
    > = {};

    TIMETABLE.TIME_SLOTS.forEach((slot) => {
      schedule[slot.id] = {};
      TIMETABLE.DAYS.forEach((_, dayIndex) => {
        schedule[slot.id][dayIndex] = { courses: [], customEntries: [] };
      });
    });

    // Place course overrides
    professorOverrides.forEach((override) => {
      const course = selectedPhaseCourses.find(
        (c) => c.courseId === override.courseId,
      );
      if (!course) return;

      override.schedule.forEach((entry) => {
        const { day, startTime, endTime, location } = entry;
        if (!endTime) return;

        const startSlotIndex = TIMETABLE.TIME_SLOTS.findIndex(
          (slot) => slot.id === startTime,
        );
        if (startSlotIndex === -1) return;

        const endSlotIndex = TIMETABLE.TIME_SLOTS.findIndex((slot) => {
          const slotTime = parseInt(slot.id.replace(":", ""));
          const eTime = parseInt(endTime.replace(":", ""));
          return slotTime >= eTime;
        });
        const lastSlotIndex =
          endSlotIndex === -1 ? TIMETABLE.TIME_SLOTS.length : endSlotIndex;

        const resolvedCourse = courseMap.get(course.courseId);
        if (!resolvedCourse) return;
        const viewCourse: ViewStudentCourse = { ...course, course: resolvedCourse };
        for (let i = startSlotIndex; i < lastSlotIndex; i++) {
          const slotId = TIMETABLE.TIME_SLOTS[i].id;
          schedule[slotId][day].courses.push({
            course: viewCourse,
            isConflicting: false,
            location,
          });
        }
      });
    });

    // Mark conflicting courses
    TIMETABLE.TIME_SLOTS.forEach((slot) => {
      TIMETABLE.DAYS.forEach((_, dayIndex) => {
        const cellCourses = schedule[slot.id][dayIndex].courses;
        if (cellCourses.length > 1) {
          cellCourses.forEach((cd) => (cd.isConflicting = true));
        }
      });
    });

    // Place custom entries
    visibleCustomEntries.forEach((entry) => {
      const startSlotIndex = TIMETABLE.TIME_SLOTS.findIndex(
        (slot) => slot.id === entry.startTime,
      );
      if (startSlotIndex === -1) return;

      const endSlotIndex = TIMETABLE.TIME_SLOTS.findIndex((slot) => {
        const slotTime = parseInt(slot.id.replace(":", ""));
        const eTime = parseInt(entry.endTime.replace(":", ""));
        return slotTime >= eTime;
      });
      const lastSlotIndex =
        endSlotIndex === -1 ? TIMETABLE.TIME_SLOTS.length : endSlotIndex;

      for (let i = startSlotIndex; i < lastSlotIndex; i++) {
        const slotId = TIMETABLE.TIME_SLOTS[i].id;
        if (schedule[slotId]?.[entry.day]) {
          schedule[slotId][entry.day].customEntries.push(entry);
        }
      }
    });

    return schedule;
  }, [selectedPhaseCourses, professorOverrides, visibleCustomEntries]);

  const courseColorMap = useMemo(() => {
    selectedPhaseCourses.forEach((course) => {
      if (!courseColors.has(course.courseId)) {
        const colorIndex = courseColors.size % TIMETABLE_COLORS.length;
        courseColors.set(course.courseId, TIMETABLE_COLORS[colorIndex]);
      }
    });
    return courseColors;
  }, [selectedPhaseCourses, courseColors]);

  const getCourseColor = (courseId: string) =>
    courseColors.get(courseId) || STATUS_CLASSES.DEFAULT;

  const handleRemoveCourse = (courseId: string) => {
    const course = selectedPhaseCourses.find((c) => c.courseId === courseId);
    if (course) setCourseClass(course, "");
  };

  const availablePhases = useMemo(() => {
    if (!studentInfo?.plans[studentInfo.currentPlan]?.semesters) return [1];
    return studentInfo.plans[studentInfo.currentPlan].semesters.map(
      (s) => s.number,
    );
  }, [studentInfo]);

  const handleExportCalendar = () => {
    let icsContent =
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//MyUFSC//Schedule//EN\r\nCALSCALE:GREGORIAN\r\n";

    const now = new Date();
    const currentYear = now.getFullYear();
    const augFirst = new Date(currentYear, 7, 1);
    const isBeforeAug = now < augFirst;
    const untilDate = isBeforeAug
      ? new Date(currentYear, 7, 1, 23, 59, 59)
      : new Date(currentYear, 11, 25, 23, 59, 59);
    const untilStr =
      untilDate.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() + diffToMonday);
    currentMonday.setHours(0, 0, 0, 0);

    const dayMap = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
    const cryptoCounter = Math.floor(Math.random() * 1000000);
    let eventCounter = 0;

    const addEvent = (
      title: string,
      desc: string,
      dayIdx: number,
      startTime: string,
      endTime: string,
      location: string,
    ) => {
      const eventDate = new Date(currentMonday);
      eventDate.setDate(currentMonday.getDate() + dayIdx);

      const toUTCStr = (timeStr: string) => {
        const [h, m] = timeStr.split(":").map(Number);
        const d = new Date(eventDate);
        d.setHours(h, m, 0, 0);
        return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      };

      const startStr = toUTCStr(startTime);
      const endStr = toUTCStr(endTime);

      icsContent += "BEGIN:VEVENT\r\n";
      icsContent += `UID:event-${cryptoCounter}-${eventCounter++}@myufsc\r\n`;
      icsContent += `SUMMARY:${title}\r\n`;
      if (desc) icsContent += `DESCRIPTION:${desc.replace(/\n/g, "\\n")}\r\n`;
      if (location) icsContent += `LOCATION:${location}\r\n`;

      icsContent += `DTSTART:${startStr}\r\n`;
      icsContent += `DTEND:${endStr}\r\n`;
      icsContent += `RRULE:FREQ=WEEKLY;BYDAY=${dayMap[dayIdx]};UNTIL=${untilStr}\r\n`;
      icsContent += "END:VEVENT\r\n";
    };

    // Export selected courses
    professorOverrides.forEach((override) => {
      const course = selectedPhaseCourses.find(
        (c) => c.courseId === override.courseId,
      );
      if (!course) return;
      const title = courseMap.get(course.courseId)?.name ?? course.courseId;
      const desc = `Turma: ${override.classNumber}\\nProfessor: ${override.professorId}`;
      override.schedule.forEach((entry) => {
        if (!entry.endTime) return;
        addEvent(
          title,
          desc,
          entry.day,
          entry.startTime,
          entry.endTime,
          entry.location || "",
        );
      });
    });

    // Export custom entries
    visibleCustomEntries.forEach((entry) => {
      addEvent(
        entry.title,
        entry.subtitle || "",
        entry.day,
        entry.startTime,
        entry.endTime,
        "",
      );
    });

    icsContent += "END:VCALENDAR\r\n";

    const blob = new Blob([icsContent], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meu-cronograma-fase-${selectedPhase}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex flex-col md:flex-row gap-4">
        {/* Timetable - 2/3 width */}
        <div className="w-full md:w-2/3">
          <TimetableHeader
            selectedCampus={selectedCampus}
            selectedSemester={selectedSemester}
            availableSemesters={availableSemesters || []}
            selectedPhase={selectedPhase}
            isLoadingData={isLoadingscheduleData}
            onCampusChange={onCampusChange}
            onSemesterChange={onSemesterChange}
            onPhaseChange={setSelectedPhase}
            availablePhases={availablePhases}
            onExportCalendar={handleExportCalendar}
          />

          {/* Info note — between header controls and the grid */}
          <div className="mb-1 flex items-start gap-1.5 text-xs text-muted-foreground px-1">
            <CalendarPlus2 className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-70" />
            <span>
              Clique em qualquer célula vazia para adicionar um evento pessoal.
              Eventos podem repetir em todas as fases ou ser exclusivos de uma
              fase específica.
            </span>
          </div>

          <TimetableGrid
            courseSchedule={courseSchedule}
            getCourseColor={getCourseColor}
            onEmptyCellClick={openNewEntry}
            onCustomEntryClick={openEditEntry}
          />
        </div>

        {/* Course Stats - 1/3 width */}
        <div className="w-full md:w-1/3">
          <CourseStats
            courses={selectedPhaseCourses}
            timetableData={timetableData}
            selectedPhase={selectedPhase}
            onProfessorSelect={handleProfessorSelect}
            coursesInTimetable={professorOverrides.map((o) => o.courseId)}
            courseColors={courseColors}
            onRemoveCourse={handleRemoveCourse}
            professorAggregates={professorAggregates}
            onProfessorClick={handleProfessorClick}
            searchRefreshTrigger={searchRefreshTrigger}
          />
        </div>
      </div>

      {/* Custom event modal */}
      <CustomEventModal
        open={modalState.open}
        onClose={() => setModalState(closedModal)}
        initialEntry={modalState.open ? modalState.prefill : undefined}
        lastEntry={lastEntry}
        currentPhase={selectedPhase}
        onSave={handleSave}
        onDelete={removeCustomScheduleEntry}
      />

      <ProfessorDetailsDialog
        professorId={detailsProfessorId}
        taughtCourses={knownTaughtCourses}
        onClose={() => setDetailsProfessorId(null)}
        onReviewChanged={() => {
          setAggregatesRefreshKey((k) => k + 1);
          setSearchRefreshTrigger((k) => k + 1);
        }}
      />
    </>
  );
}
