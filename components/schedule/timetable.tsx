"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
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
import type { ClassSchedule } from "@/parsers/class-parser";
import { expandToCells } from "@/lib/schedule-conflict";
import { useStudentStore } from "@/lib/student-store";
import { useCourseMap } from "@/hooks/useCourseMap";
import { useStableValue } from "@/hooks/useStableValue";

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
  slots: ClassSchedule[];
  classNumber: string;
  location: string;
};

interface Professor {
  professorId: string;
  name: string;
  classNumber: string;
  schedule: string;
  slots: ClassSchedule[];
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
  // This used to be an early `return` sitting in the middle of the function
  // (after ~10 hook calls) — meaning a component with an incomplete
  // studentInfo would call a *different number* of hooks than a fully
  // loaded one, a Rules-of-Hooks violation. Every hook below must run
  // unconditionally every render, so this is now just a flag; the actual
  // conditional JSX return happens at the very end, after all hooks.
  const plan = studentInfo?.plans?.[studentInfo.currentPlan];
  const isDataReady = !!studentInfo && !!plan && !!plan.semesters;

  const courseMap = useCourseMap();
  const addCustomScheduleEntry = useStudentStore((s) => s.addCustomScheduleEntry);
  const removeCustomScheduleEntry = useStudentStore((s) => s.removeCustomScheduleEntry);
  const updateCustomScheduleEntry = useStudentStore((s) => s.updateCustomScheduleEntry);
  const setCourseClass = useStudentStore((s) => s.setCourseClass);
  const clearSchedule = useStudentStore((s) => s.clearSchedule);

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

  // Switching the MatrUFSC semester swaps the whole professor/class data
  // source out from under the panel, so any course/professor currently being
  // viewed no longer refers to something meaningful — clear it (the existing
  // fade-out animation on ProfessorSelector's unmount handles the "vanish").
  const onSemesterChange = (semester: string) => {
    clearSchedule();
    setScheduleState((prev) => ({
      ...prev,
      selectedSemester: semester,
    }));
  };

  const [selectedPhase, setSelectedPhase] = useState<number>(1);

  // Same reasoning as onSemesterChange: a course selected in one phase isn't
  // meaningful once you've switched to viewing a different phase's courses.
  const handlePhaseChange = (phase: number) => {
    clearSchedule();
    setSelectedPhase(phase);
  };
  const [courseColors] = useState(() => new Map<string, string>());

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

  // Stable references (useCallback) so TimetableGrid's React.memo can
  // actually bail out on unrelated re-renders instead of always seeing "new"
  // handler props.
  const openNewEntry = useCallback((day: number, slotId: string) => {
    setModalState({
      open: true,
      editing: false,
      prefill: { day, startTime: slotId },
    });
  }, []);

  const openEditEntry = useCallback((entry: CustomScheduleEntry) => {
    setModalState({ open: true, editing: true, prefill: entry });
  }, []);

  const handleSave = (entry: CustomScheduleEntry) => {
    if (modalState.editing) {
      updateCustomScheduleEntry(entry);
    } else {
      addCustomScheduleEntry(entry);
    }
    setLastEntry(entry);
  };

  // Persist a drag: the overlay hands back the new day + start/end times.
  const handleCustomEntryMove = useCallback(
    (
      entry: CustomScheduleEntry,
      day: number,
      startTime: string,
      endTime: string,
    ) => {
      updateCustomScheduleEntry({ ...entry, day, startTime, endTime });
    },
    [updateCustomScheduleEntry],
  );

  // ─── Derive visible custom entries for the current phase ──────────────────
  const visibleCustomEntries = useMemo(
    () =>
      customScheduleEntries.filter(
        (e) => e.recurring || e.scopedToPhase === selectedPhase,
      ),
    [customScheduleEntries, selectedPhase],
  );

  const timetableData = useMemo(() => {
    if (scheduleData) {
      return parsescheduleData(scheduleData);
    }
    return emptyScheduleData as ScheduleData;
  }, [scheduleData]);

  // `studentInfo` gets a new top-level reference on every store mutation,
  // even ones affecting a completely different phase — so without
  // `useStableValue`, this array's identity (and everything keyed off it
  // below: professorOverrides, courseSchedule, the O(n) conflict marking)
  // would be rebuilt from scratch on every unrelated change anywhere in the
  // app, not just changes to the phase actually being viewed.
  const selectedPhaseCoursesRaw = useMemo(() => {
    if (!studentInfo?.plans[studentInfo.currentPlan]) return [];
    const semester = studentInfo.plans[studentInfo.currentPlan]?.semesters.find(
      (s) => s.number === selectedPhase,
    );
    if (!semester) return [];
    return semester.courses;
  }, [studentInfo, selectedPhase]);
  const selectedPhaseCourses = useStableValue(selectedPhaseCoursesRaw);

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

  // Build the override straight from the section's structured `slots`
  // (parsers/class-parser.ts) instead of regex-reparsing the human-readable
  // `professor.schedule` string. `ClassSchedule` and `ScheduleEntry` share a
  // shape, so this is a direct map — and it keeps a single source of truth for
  // per-section times (also feeding lib/schedule-conflict.ts).
  const parseScheduleForProfessor = (
    professorData: Professor,
    course: StudentCourse,
  ): ProfessorOverride | null => {
    const slots = professorData.slots ?? [];
    const scheduleEntries: ScheduleEntry[] = slots.map((slot) => ({
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime,
      location: slot.location ?? "",
    }));

    return {
      courseId: course.courseId,
      professorId: professorData.professorId,
      schedule: scheduleEntries,
      slots,
      classNumber: professorData.classNumber,
      location: scheduleEntries[scheduleEntries.length - 1]?.location || "",
    };
  };

  // This was a `useEffect` + `setState` pair, but the computation is a pure,
  // synchronous derivation of `selectedPhaseCourses`/`timetableData` — no
  // async work at all. Doing it as an effect meant every course/professor
  // pick cost *two* full render passes: one immediately (with the schedule
  // still reflecting the old override, since effects run after commit) and
  // a second once the effect finally ran and called setState — each one
  // re-rendering the whole grid. A plain `useMemo` computes this in the same
  // pass as everything else, so the grid updates once, correctly, per click.
  const professorOverrides = useMemo(() => {
    if (!timetableData || !selectedPhaseCourses) return [];
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

    return newOverrides;
  }, [selectedPhaseCourses, timetableData]);

  const [aggregatesRefreshKey, setAggregatesRefreshKey] = useState(0);

  // Fetch ratings for every course in the *currently viewed phase*, not just
  // ones that already have a class picked. The old scope meant a course's
  // aggregates were only ever fetched *after* you'd already chosen a
  // professor for it — exactly backwards, since ratings are supposed to help
  // you choose in the first place. It also meant that clicking through
  // professors to compare options paid a fresh network round-trip on each
  // first pick, right in the middle of the interaction. Fetching for the
  // whole phase up front means ratings are already warm (or cached — see
  // lib/professors-client.ts's LRU) by the time you start clicking.
  const selectedPhaseCourseIdsKey = selectedPhaseCourses
    .map((c) => c.courseId)
    .sort()
    .join(",");
  useEffect(() => {
    const courseIds = selectedPhaseCourseIdsKey
      ? selectedPhaseCourseIdsKey.split(",")
      : [];
    if (courseIds.length > 0) {
      fetchProfessorAggregates(courseIds)
        .then((data) => setProfessorAggregates(data))
        .catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhaseCourseIdsKey, aggregatesRefreshKey]);

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
        }
      >
    > = {};

    TIMETABLE.TIME_SLOTS.forEach((slot) => {
      schedule[slot.id] = {};
      TIMETABLE.DAYS.forEach((_, dayIndex) => {
        schedule[slot.id][dayIndex] = { courses: [] };
      });
    });

    // Place course overrides. Cell expansion (which grid cells a section spans)
    // is delegated to lib/schedule-conflict.ts so the timetable and the plan
    // generator share one boundary rule. We expand per slot to keep each cell's
    // location metadata for rendering.
    professorOverrides.forEach((override) => {
      const course = selectedPhaseCourses.find(
        (c) => c.courseId === override.courseId,
      );
      if (!course) return;

      const resolvedCourse = courseMap.get(course.courseId);
      if (!resolvedCourse) return;
      const viewCourse: ViewStudentCourse = { ...course, course: resolvedCourse };

      override.slots.forEach((slot) => {
        expandToCells([slot]).forEach((cell) => {
          const [dayStr, slotIndexStr] = cell.split(":");
          const day = parseInt(dayStr, 10);
          const slotId = TIMETABLE.TIME_SLOTS[parseInt(slotIndexStr, 10)].id;
          schedule[slotId][day].courses.push({
            course: viewCourse,
            isConflicting: false,
            location: slot.location,
          });
        });
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

    // Custom events are no longer placed in cells — they render in the
    // free-positioned, draggable overlay (see CustomEventsOverlay).
    return schedule;
  }, [selectedPhaseCourses, professorOverrides]);

  const courseColorMap = useMemo(() => {
    selectedPhaseCourses.forEach((course) => {
      if (!courseColors.has(course.courseId)) {
        const colorIndex = courseColors.size % TIMETABLE_COLORS.length;
        courseColors.set(course.courseId, TIMETABLE_COLORS[colorIndex]);
      }
    });
    return courseColors;
  }, [selectedPhaseCourses, courseColors]);

  const getCourseColor = useCallback(
    (courseId: string) => courseColors.get(courseId) || STATUS_CLASSES.DEFAULT,
    [courseColors],
  );

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

  if (!isDataReady) {
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

  return (
    <>
      {/* items-start (not the flex default `stretch`) so CourseStats'
          animated height (professor selector fade) can never stretch or
          squish its sibling timetable column. */}
      <div className="flex flex-col md:flex-row items-start gap-4">
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
            onPhaseChange={handlePhaseChange}
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
            customEntries={visibleCustomEntries}
            getCourseColor={getCourseColor}
            onEmptyCellClick={openNewEntry}
            onCustomEntryClick={openEditEntry}
            onCustomEntryMove={handleCustomEntryMove}
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
