use clatutor;


create table addtest(test_id bigint primary key auto_increment,title varchar(1000),
queation_paper_url varchar(1000), answer_key_url varchar(1000),
scheduled date, selected_branch json, 
 added_by varchar(100),
created_at timestamp default current_timestamp);


select *From addtest;

ALTER TABLE addtest
ADD COLUMN isGK bool default false;




create table submitted_online_test(id bigint primary key auto_increment, test_id bigint,
title varchar(1000), student_name varchar(100), batch varchar(100), branch varchar(50),
answers json, submitted_by varchar(50), attended_queations bigint,
correctAnswer bigint, totalgrade varchar(30), created_at timestamp default current_timestamp);

select *from submitted_online_test;

alter table submitted_online_test add column studentEmail bool default false;

	

create table request_callback(id int primary key auto_increment, fullname varchar(50),
email varchar(100), phone bigint, interested_in varchar(100),
message varchar(2000), created_at timestamp default current_timestamp);

select *from request_callback;

ALTER TABLE request_callback
ADD COLUMN response_message varchar(100);

create table enroll_request(id int primary key auto_increment, target_year varchar(50),
course varchar(50), student_name varchar(50), parentName varchar(50),
student_email varchar(100), parent_email varchar(100), student_PhoneNumber bigint,
parent_PhoneNumber bigint, student_dob date, address varchar(1000),
school_college varchar(100), stream varchar(50), source_of_info varchar(50),
created_at timestamp default current_timestamp);

select *From enroll_request;

ALTER TABLE enroll_request
ADD COLUMN response_message varchar(100);



create table downloadAnswer(id int primary key auto_increment, name varchar(100),
email varchar(50), phone bigint, city varchar(50), year varchar(50),
created_at timestamp default current_timestamp);

select *from downloadAnswer;


create table contactUs(id int primary key auto_increment, name varchar(100),
email varchar(100), phone bigint, subject varchar(100),
message varchar(1000), isResponded bool default false, 
respondedMessage varchar(1000),created_at timestamp default current_timestamp);

select *from contactUs;

ALTER TABLE contactUs
ADD COLUMN response_message varchar(100);


create table fees(id int primary key auto_increment, receipt_id varchar(100) unique,
receipt_date timestamp default current_timestamp,student_id varchar(50),
name varchar(40), email varchar(50), phone bigint unique, dob date,batch varchar(20), branch varchar(30),
address varchar(1000), payement_mode varchar(40),payment_date date,
amount_paid bigint, cheque_no bigint, DraweeBank varchar(100), bank_branch varchar(100),
transation_id varchar(1000), bank varchar(100), cardNum int, network varchar(50),
upiTransation_id varchar(1000), paymentDetails varchar(1000),
amount_in_words varchar(1000), 
tution_fess bigint, amount_in_words_total varchar(1000), installment_plan json,
added_by varchar(100), created_at timestamp default current_timestamp);

select *from fees;


use clatutor;


create table previous_Queation_paper(id int primary key auto_increment, year varchar(50),
queation_paper_url varchar(1000), added_by varchar(100), 
created_at timestamp default current_timestamp);

select*from previous_Queation_paper;



create table courseVideo(id int primary key auto_increment, title varchar(100),
video_url varchar(1000), added_by varchar(100),
created_at timestamp default current_timestamp);

select *from courseVideo;




create table courseView(video_id int primary key auto_increment, video_url varchar(1000),
added_by varchar(100), isSaved bool default false, created_at timestamp default current_timestamp);

select *from courseView;



CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch VARCHAR(50),
  branch VARCHAR(50),
  target_year VARCHAR(50),
  attendance_date DATE NOT NULL,
  student_id VARCHAR(50) NOT NULL,
  name VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'absent',
  added_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_attendance_session_student (
    attendance_date, 
    batch, 
    branch, 
    target_year, 
    student_id
  )
);


select *From attendance;
