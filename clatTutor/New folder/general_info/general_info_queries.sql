-- MySQL reference scripts for clatutor (not SQL Server syntax).
-- Run statements one at a time in MySQL Workbench / CLI.

CREATE DATABASE IF NOT EXISTS clatutor;
USE clatutor;

CREATE TABLE IF NOT EXISTS admin (
  admin_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100),
  email VARCHAR(100),
  branch VARCHAR(30),
  password VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT * FROM admin;

INSERT INTO admin (name, email, branch, password) VALUES
  ('admin head', 'biplavmehta@gmail.com', 'yelahanka', 'Clatutor123!');

INSERT INTO admin (name, email, branch, password) VALUES
  ('admin head', 'clatutor.jayanagara@gmail.com', 'Malleshwarm', 'Clatutor123!');

INSERT INTO admin (name, email, branch, password) VALUES
  ('admin head', 'sandya.clatutor@gmail.com', 'Malleshwarm', 'Clatutor123!');

CREATE TABLE IF NOT EXISTS student_general_info (
  student_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  img_url VARCHAR(1000),
  name VARCHAR(40),
  email VARCHAR(50),
  phone BIGINT UNIQUE,
  parents_number VARCHAR(100),
  dob DATE,
  previous_organisation VARCHAR(50),
  batch VARCHAR(20),
  branch VARCHAR(30),
  stream VARCHAR(50),
  address VARCHAR(1000),
  source_of_info VARCHAR(100),
  targetYear VARCHAR(50),
  added_by VARCHAR(100),
  password VARCHAR(50) UNIQUE,
  roles JSON,
  isDrop BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) AUTO_INCREMENT = 2026001;

SELECT * FROM student_general_info;

-- Safe migrations for existing tables (run only if column missing)
-- ALTER TABLE student_general_info ADD COLUMN roles JSON;
-- ALTER TABLE student_general_info ADD COLUMN isDrop BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS student_achievement (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100),
  img_url VARCHAR(1000),
  percentage VARCHAR(50),
  exam VARCHAR(30),
  city VARCHAR(100),
  branch VARCHAR(30),
  added_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT * FROM student_achievement;

CREATE TABLE IF NOT EXISTS faculty (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100),
  email VARCHAR(100),
  phone BIGINT,
  img_url VARCHAR(1000),
  education VARCHAR(50),
  city VARCHAR(30),
  branch VARCHAR(30),
  address VARCHAR(100),
  password VARCHAR(10) UNIQUE,
  added_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) AUTO_INCREMENT = 20211;

SELECT * FROM faculty;

USE clatutor;

CREATE TABLE IF NOT EXISTS class (
  id INT PRIMARY KEY AUTO_INCREMENT,
  image_url JSON,
  location VARCHAR(50),
  added_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT * FROM class;

CREATE TABLE IF NOT EXISTS currentAffairs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  date DATE,
  name VARCHAR(50),
  img_url JSON,
  links VARCHAR(5000),
  added_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT * FROM currentAffairs;

CREATE TABLE IF NOT EXISTS notes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  Title VARCHAR(100),
  img_url JSON,
  link JSON,
  added_by VARCHAR(100),
  created_by TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT * FROM notes;
