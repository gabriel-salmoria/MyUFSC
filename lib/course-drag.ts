// Shared plumbing for the custom pointer-events-based course drag-and-drop.
//
// Native HTML5 drag-and-drop (the `draggable` attribute + DataTransfer) was
// replaced because Chrome does not dispatch `wheel` events for the duration
// of a native drag session, making it impossible to scroll the page with the
// mouse wheel while dragging a course. Pointer Events + manual DOM tracking
// don't have this limitation, since there is no native OS-level drag session.
//
// Everything here is same-document, so the drag payload is just a module
// -level variable instead of DataTransfer — there is no cross-window/frame
// boundary to protect against.

import type { ViewStudentCourse } from "@/types/visualization";

export type DragSourceVisualizer = "curriculum" | "progress";

export interface CourseDragPayload {
  studentCourse: ViewStudentCourse;
  sourceVisualizer: DragSourceVisualizer;
}

let currentPayload: CourseDragPayload | null = null;

export function setCourseDragPayload(payload: CourseDragPayload | null) {
  currentPayload = payload;
}

export function getCourseDragPayload(): CourseDragPayload | null {
  return currentPayload;
}

// Fired on `window` when a drag starts/ends, detail: { sourceVisualizer }.
export const COURSE_DRAG_START = "coursedragstart";
export const COURSE_DRAG_END = "coursedragend";

// Fired directly on the current drop-target element (found via
// elementFromPoint + closest("[data-drop-target]")) as the pointer enters,
// leaves, or drops over it.
export const COURSE_DRAG_ENTER = "coursedragenter";
export const COURSE_DRAG_LEAVE = "coursedragleave";
export const COURSE_DROP = "coursedrop";
