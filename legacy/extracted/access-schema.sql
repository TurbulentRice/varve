-- ----------------------------------------------------------
-- MDB Tools - A library for reading MS Access database files
-- Copyright (C) 2000-2011 Brian Bruns and others.
-- Files in libmdb are licensed under LGPL and the utilities under
-- the GPL, see COPYING.LIB and COPYING files respectively.
-- Check out http://mdbtools.sourceforge.net
-- ----------------------------------------------------------

-- That file uses encoding UTF-8

CREATE TABLE `tblAccountOwner`
 (
	`AccountOwnerID`			INTEGER, 
	`AccountOwner`			varchar
	, PRIMARY KEY (`AccountOwnerID`)
);

-- CREATE INDEXES ...

CREATE TABLE `tblPerformance`
 (
	`PerformanceID`			INTEGER, 
	`YearFK`			INTEGER, 
	`PortfolioFK`			INTEGER, 
	`Q0`			REAL, 
	`Q1`			REAL, 
	`Q2`			REAL, 
	`Q3`			REAL, 
	`Q4`			REAL, 
	`Q1Cont`			REAL, 
	`Q2Cont`			REAL, 
	`Q3Cont`			REAL, 
	`Q4Cont`			REAL, 
	`Q1Fees`			REAL, 
	`Q2Fees`			REAL, 
	`Q3Fees`			REAL, 
	`Q4Fees`			REAL
	, PRIMARY KEY (`PerformanceID`)
);

-- CREATE INDEXES ...

CREATE TABLE `tblPortfolio`
 (
	`PortfolioID`			INTEGER, 
	`AccountOwnerFK`			INTEGER, 
	`PortfolioTypeFK`			INTEGER, 
	`PortfolioName`			varchar, 
	`Active`			INTEGER NOT NULL
	, PRIMARY KEY (`PortfolioID`)
);

-- CREATE INDEXES ...
CREATE INDEX `tblPortfolio_AccountOwnerFID_idx` ON `tblPortfolio` (`AccountOwnerFK`);

CREATE TABLE `tblPortfolioType`
 (
	`PortfolioTypeID`			INTEGER, 
	`PortfolioType`			varchar
	, PRIMARY KEY (`PortfolioTypeID`)
);

-- CREATE INDEXES ...

CREATE TABLE `tblYear`
 (
	`YearID`			INTEGER, 
	`Notes`			TEXT
	, PRIMARY KEY (`YearID`)
);

-- CREATE INDEXES ...


