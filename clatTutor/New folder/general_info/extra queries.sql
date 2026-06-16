use clatutor;

create table demoClass(id int primary key auto_increment,
name varchar(50), email varchar(50),
phone bigint, interested_in varchar(50),
created_at timestamp default current_timestamp);

select *from demoClass;

ALTER TABLE demoClass
ADD COLUMN response_message varchar(100);

create table student_attendance(id int primary key auto_increment,
student_id varchar(10), name varchar(50), batch varchar(50), branch varchar(50),
target_year varchar(30), isPresent bool default false, isAbsent bool default false,
created_at timestamp default current_timestamp, added_by varchar(50));

select *from student_attendance;
