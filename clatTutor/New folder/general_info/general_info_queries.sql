create database clatutor;
use clatutor;

create table admin(admin_id int primary key auto_increment,
name varchar(100), email varchar(100), branch varchar(30),
password varchar(50), created_at timestamp default current_timestamp);

select*from admin;

insert into admin (name, email, branch, password) values(
'admin head', 'clatutor.malleshwaram@gmail.com','Malleshwarm','Clatutor123!');


insert into admin (name, email, branch, password) values(
'admin head', 'clatutor.jayanagara@gmail.com','Malleshwarm','Clatutor123!');

drop table admin;

create table student_general_info(student_id bigint primary key auto_increment,img_url varchar(1000),
name varchar(40), email varchar(50), phone bigint unique, dob date, previous_organisation varchar(50),
batch varchar(20), branch varchar(30),
stream varchar(50), address varchar(1000), source_of_info varchar(100), targetYear varchar(50), added_by varchar(100),
password varchar(50) unique,
created_at timestamp default current_timestamp)AUTO_INCREMENT = 2026001;

select *from student_general_info;

drop table student_general_info;


create table student_achievement(id int primary key auto_increment, name varchar(100),
img_url varchar(1000),percentage varchar(50), exam varchar(30), city varchar(100),
branch varchar(30),
added_by varchar(100), created_at timestamp default current_timestamp);

select*from student_achievement;

drop table student_achievement;



create table faculty(id int primary key auto_increment, name varchar(100),
email varchar(100), phone bigint,
img_url varchar(1000), education varchar(50), city varchar(30), branch varchar(30),
address varchar(100), password varchar(10) unique, added_by varchar(100), 
created_At timestamp default current_timestamp)AUTO_INCREMENT = 20211;

select *from faculty;

drop table faculty;

use clatutor;


create table class(id int primary key auto_increment, image_url json,
location varchar(50), added_by varchar(100), created_at timestamp default current_timestamp);

select *from class;

drop table class;



create table currentAffairs(id int primary key auto_increment, date date,
name varchar(50), img_url json, links varchar(5000), added_by varchar(100),
created_at timestamp default current_timestamp);

select *from currentAffairs;

drop table currentAffairs;


create table notes(id int primary key auto_increment, date date, 
details varchar(100), img_url json, link json, added_by varchar(100),
created_by timestamp default current_timestamp);

select *from notes;

drop table notes;
