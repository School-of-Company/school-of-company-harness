---
name: java-spring-arch
description: Architecture reference for Java + Spring Boot 4.0 projects — Controller/Service/Repository layer responsibilities, @Transactional strategy (readOnly optimization, N+1 prevention), ExpectedException usage, and Entity↔DTO conversion patterns.
---

# Java + Spring Boot Architecture Guide

## Applies To

Java + Spring Boot. **Check before using any of it** — items are picked by hand on a dashboard, and this
one has landed in Kotlin and Node repos:

```bash
ls pom.xml build.gradle build.gradle.kts package.json 2>/dev/null
ls -d src/main/java src/main/kotlin 2>/dev/null
```

If `src/main/kotlin` or a `.kts` build file is what's there, this is a Kotlin project — use
`kotlin-spring-arch`. If it's `package.json` with NestJS, use `nestjs-arch`. When neither of those is
installed, say this guidance doesn't apply instead of translating it: the patterns below assume
checked exceptions, `Optional`, and getter/setter DTOs, none of which survive the trip intact.

## Layer Structure

### Controller
- Role: Request validation, DTO conversion, HTTP response
- Annotations: `@RestController`, `@RequestMapping`
- Validation: `@Valid`, `@Validated`
- Response: return the ResDto directly — no envelope wrapper (see the `api-design` skill)

### Service
- Role: Business logic, transaction management
- Pattern: interface + implementation
- Transaction:
  - Read: `@Transactional(readOnly = true)`
  - Write: `@Transactional`
- Dependencies: Inject Repository via constructor injection

### Repository
- Role: Data access
- JPA: Extend `JpaRepository`
- Avoid N+1: Fetch Join, `@EntityGraph`

## Transaction Strategy

### Read-only Optimization
```java
@Transactional(readOnly = true)
public List<StudentResDto> findStudents() {
    return repository.findAll().stream()
        .map(StudentResDto::from)
        .toList();
}
```

### N+1 Problem Resolution
```java
// ❌ N+1 occurs
repository.findAll(); // 1 query
entity.getRelatedEntities(); // N queries

// ✅ Fetch Join
@Query("SELECT e FROM Entity e JOIN FETCH e.relatedEntities")
List<Entity> findAllWithRelated();
```

## Exception Handling

```java
throw new ExpectedException("학생을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
```

## DTO Conversion Pattern

```java
// Entity → ResDto (static factory)
public static StudentResDto from(Student student) {
    return new StudentResDto(student.getId(), student.getName());
}
```