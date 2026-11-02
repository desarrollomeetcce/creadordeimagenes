import { courseGroups, type CourseGroupId } from "./teaching";
import type { CourseSettings } from "./schema";
export type LibraryCategory = {
  id: CourseGroupId;
  title: string;
  create: string;
  icon: string;
  description: string;
  color: string;
  audience: CourseSettings["audience"];
};
export const categoryColors = [
  "#b28bfa",
  "#4bbcb7",
  "#edab6a",
  "#79a7ee",
  "#ed89bc",
  "#8bc781",
];
export const defaultCategories: LibraryCategory[] = courseGroups.map(
  (g, i) => ({ ...g, color: categoryColors[i], audience: g.id }),
);
export type CourseSummary = {
  id: string;
  title: string;
  description: string;
  kind: string;
  settings: Pick<
    CourseSettings,
    "libraryGroup" | "audience" | "audienceDetail"
  >;
  _count: { modules: number };
};
export type LibraryConfig = { revision: number; groups: LibraryCategory[] };
export type CategoryPage = {
  groupId: CourseGroupId;
  page: number;
  pageSize: number;
  query: string;
  total: number;
  courses: CourseSummary[];
};
export type LibraryHandle = { refresh: (courseId?: string) => Promise<void> };
export function moveCategory(
  ids: CourseGroupId[],
  from: CourseGroupId,
  to: CourseGroupId,
) {
  const start = ids.indexOf(from),
    end = ids.indexOf(to);
  if (start < 0 || end < 0 || start === end) return ids;
  const result = ids.slice();
  result.splice(start, 1);
  result.splice(end, 0, from);
  return result;
}

export function foldCourseSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}
