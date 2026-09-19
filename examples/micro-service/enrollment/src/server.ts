import { createApp } from "./app.js";
import { createStudentId, createCourseId } from "./types/index.js";

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.start();

  const { commandBus, queryBus } = app;

  console.log();
  console.log("─".repeat(60));
  console.log("  Seeding demo data");
  console.log("─".repeat(60));
  console.log();

  const { EnrollStudentCommand } =
    await import("./services/enrollment/commands/enroll-student/enroll-student.command.js");
  const { WithdrawStudentCommand } =
    await import("./services/enrollment/commands/withdraw-student/withdraw-student.command.js");

  const student1Id = createStudentId("student-001");
  const student2Id = createStudentId("student-002");
  const course1Id = createCourseId("course-ts-101");
  const course2Id = createCourseId("course-arch-201");
  const course3Id = createCourseId("course-dbs-301");

  console.log(`[Seed] Students: ${student1Id}, ${student2Id}`);
  console.log(`[Seed] Courses: ${course1Id}, ${course2Id}, ${course3Id}`);
  console.log();

  const enrollment1 = (await commandBus.execute(
    new EnrollStudentCommand({ studentId: student1Id, courseId: course1Id }),
  )) as { id: string; status: string };
  console.log(`[Seed] Enrollment 1: ${enrollment1.id} (${enrollment1.status})`);

  const enrollment2 = (await commandBus.execute(
    new EnrollStudentCommand({ studentId: student1Id, courseId: course2Id }),
  )) as { id: string; status: string };
  console.log(`[Seed] Enrollment 2: ${enrollment2.id} (${enrollment2.status})`);

  const enrollment3 = (await commandBus.execute(
    new EnrollStudentCommand({ studentId: student2Id, courseId: course1Id }),
  )) as { id: string; status: string };
  console.log(`[Seed] Enrollment 3: ${enrollment3.id} (${enrollment3.status})`);

  const enrollment4 = (await commandBus.execute(
    new EnrollStudentCommand({ studentId: student2Id, courseId: course3Id }),
  )) as { id: string; status: string };
  console.log(`[Seed] Enrollment 4: ${enrollment4.id} (${enrollment4.status})`);

  console.log();
  console.log("─".repeat(60));
  console.log("  Querying data");
  console.log("─".repeat(60));
  console.log();

  const { ListStudentEnrollmentsQuery } =
    await import("./services/enrollment/queries/list-student-enrollments/list-student-enrollments.query.js");

  const student1Enrollments = (await queryBus.execute(
    new ListStudentEnrollmentsQuery(student1Id),
  )) as readonly { courseId: string; status: string }[];
  console.log(`[Query] Student 1 enrollments: ${student1Enrollments.length}`);
  for (const e of student1Enrollments) {
    console.log(`  - ${e.courseId} (${e.status})`);
  }

  const student2Enrollments = (await queryBus.execute(
    new ListStudentEnrollmentsQuery(student2Id),
  )) as readonly { courseId: string; status: string }[];
  console.log(`[Query] Student 2 enrollments: ${student2Enrollments.length}`);
  for (const e of student2Enrollments) {
    console.log(`  - ${e.courseId} (${e.status})`);
  }

  console.log();
  console.log("─".repeat(60));
  console.log("  Withdrawing student 1 from course 1");
  console.log("─".repeat(60));
  console.log();

  const withdrawal = (await commandBus.execute(
    new WithdrawStudentCommand({ studentId: student1Id, courseId: course1Id }),
  )) as { id: string; status: string };
  console.log(`[Withdraw] Enrollment ${withdrawal.id}: ${withdrawal.status}`);

  const updatedStudent1Enrollments = (await queryBus.execute(
    new ListStudentEnrollmentsQuery(student1Id),
  )) as readonly { courseId: string; status: string }[];
  console.log(
    `[Query] Student 1 enrollments after withdrawal: ${updatedStudent1Enrollments.length}`,
  );
  for (const e of updatedStudent1Enrollments) {
    console.log(`  - ${e.courseId} (${e.status})`);
  }

  console.log();
  console.log("=".repeat(60));
  console.log("  CampusFlow Enrollment Service");
  console.log("=".repeat(60));
  console.log();
  console.log("Architecture:");
  console.log("  Single service   → Enrollment domain only");
  console.log("  CQRS pattern     → Commands write, queries read");
  console.log(
    "  Event-driven     → Publishes StudentEnrolled/StudentWithdrawn",
  );
  console.log("  SQLite           → Lightweight persistence");
  console.log();
  console.log("API Endpoints:");
  console.log("  POST   /enrollments              → Enroll a student");
  console.log("  POST   /enrollments/withdraw     → Withdraw a student");
  console.log("  GET    /enrollments/:id          → Get enrollment by ID");
  console.log("  GET    /enrollments/student/:id  → List student enrollments");
  console.log();
  console.log("Key patterns:");
  console.log("  ✓ CQRS with typed commands and queries");
  console.log("  ✓ Event publishing via EventBus");
  console.log("  ✓ Repository pattern for data access");
  console.log("  ✓ Branded types for ID safety");
  console.log("  ✓ Validation schemas with Zod");
  console.log("  ✓ Module registration with dependency injection");
  console.log();
  console.log("=".repeat(60));
}

bootstrap().catch(console.error);
