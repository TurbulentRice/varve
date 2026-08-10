-- Reconstructed by mdbtools. JOIN predicates and GROUP BY are NOT recovered.
-- Joins follow the FK chain: Performance->Portfolio->{AccountOwner,PortfolioType}, Performance->Year

-- ===== qryFeesPerAccount =====
SELECT tblAccountOwner.AccountOwner,tblPortfolioType.PortfolioType,tblPortfolio.PortfolioName,tblPerformance.PerformanceID,tblPerformance.YearFK,tblPerformance.PortfolioFK,tblPerformance.Q0,tblPerformance.Q1,tblPerformance.Q2,tblPerformance.Q3,tblPerformance.Q4,tblPortfolio.PortfolioID,tblPortfolio.AccountOwnerFK,tblPortfolio.PortfolioTypeFK,tblPerformance.Q1Fees,tblPerformance.Q2Fees,tblPerformance.Q3Fees,tblPerformance.Q4Fees FROM [tblPerformance],[tblPortfolio],[tblAccountOwner],[tblPortfolioType] WHERE (((tblPortfolioType.PortfolioType)<>"Benchmark")) ORDER BY tblAccountOwner.AccountOwner

-- ===== qryPerformanceDetail =====
SELECT tblAccountOwner.AccountOwner,tblPortfolioType.PortfolioType,tblPortfolio.PortfolioName,tblPerformance.PerformanceID,tblPerformance.YearFK,tblPerformance.PortfolioFK,tblPerformance.Q0,tblPerformance.Q1,tblPerformance.Q2,tblPerformance.Q3,tblPerformance.Q4,tblPortfolio.PortfolioID,tblPortfolio.AccountOwnerFK,tblPortfolio.PortfolioTypeFK,tblPerformance.Q1Cont,tblPerformance.Q2Cont,tblPerformance.Q3Cont,tblPerformance.Q4Cont FROM [tblPerformance],[tblPortfolio],[tblAccountOwner],[tblPortfolioType] WHERE (((tblPortfolioType.PortfolioType)<>"Benchmark")) ORDER BY tblAccountOwner.AccountOwner

-- ===== qryPerformanceDetailSP =====
SELECT tblAccountOwner.AccountOwner,tblPortfolioType.PortfolioType,tblPortfolio.PortfolioName,tblPerformance.PerformanceID,tblPerformance.YearFK,tblPerformance.PortfolioFK,tblPerformance.Q0,tblPerformance.Q1,tblPerformance.Q2,tblPerformance.Q3,tblPerformance.Q4,tblPortfolio.PortfolioID,tblPortfolio.AccountOwnerFK,tblPortfolio.PortfolioTypeFK,tblPerformance.Q1Cont,tblPerformance.Q2Cont,tblPerformance.Q3Cont,tblPerformance.Q4Cont,tblPortfolioType.PortfolioTypeID FROM [tblPerformance],[tblPortfolio],[tblAccountOwner],[tblPortfolioType] WHERE (((tblPortfolioType.PortfolioTypeID)=6)) ORDER BY tblAccountOwner.AccountOwner

-- ===== qryRetirementReportDetails =====
SELECT tblAccountOwner.AccountOwner,[AccountOwner] & "  -  " & [YearID],tblYear.YearID,[AccountOwner] & " - " & [PortfolioName],tblPerformance.Q0,tblPerformance.Q1,tblPerformance.Q2,tblPerformance.Q3,tblPerformance.Q4,tblPerformance.Q1Cont,tblPerformance.Q2Cont,tblPerformance.Q3Cont,tblPerformance.Q4Cont,tblPortfolio.PortfolioName FROM [tblAccountOwner],[tblPerformance],[tblPortfolio],[tblPortfolioType],[tblYear] WHERE (((tblYear.YearID)=2025) AND ((tblPortfolio.PortfolioTypeFK)=1 Or (tblPortfolio.PortfolioTypeFK)=5)) ORDER BY tblAccountOwner.AccountOwner

-- ===== qryRetirementReportDetailsSPSubReport =====
SELECT tblPerformance.PortfolioFK,tblPerformance.YearFK,tblPerformance.Q0,tblPerformance.Q1,tblPerformance.Q2,tblPerformance.Q3,tblPerformance.Q4 FROM [tblPerformance] WHERE (((tblPerformance.PortfolioFK)=39) AND ((tblPerformance.YearFK)=2025)) 

-- ===== qryRetirementReportSummary =====
SELECT tblAccountOwner.AccountOwner,tblYear.YearID,tblPortfolio.PortfolioName,tblPerformance.Q0,tblPerformance.Q1,tblPerformance.Q1Cont,tblPerformance.Q2,tblPerformance.Q2Cont,tblPerformance.Q3,tblPerformance.Q3Cont,tblPerformance.Q4,tblPerformance.Q4Cont FROM [tblAccountOwner],[tblPerformance],[tblPortfolio],[tblPortfolioType],[tblYear] WHERE (((tblYear.YearID)>2020) AND ((tblPortfolio.PortfolioTypeFK)=1 Or (tblPortfolio.PortfolioTypeFK)=5)) ORDER BY tblAccountOwner.AccountOwner

-- ===== qryRetirementSummary =====
SELECT tblAccountOwner.AccountOwnerID,tblAccountOwner.AccountOwner,tblPortfolioType.PortfolioTypeID,tblPortfolioType.PortfolioType,Sum(tblPerformance.Q0),Sum(tblPerformance.Q1),Sum(tblPerformance.Q2),Sum(tblPerformance.Q3),Sum(tblPerformance.Q4),tblPerformance.YearFK,Sum(tblPerformance.Q1Cont),Sum(tblPerformance.Q2Cont),Sum(tblPerformance.Q3Cont),Sum(tblPerformance.Q4Cont),tblPortfolioType.PortfolioType FROM [tblPerformance],[tblPortfolio],[tblAccountOwner],[tblPortfolioType] ORDER BY tblPerformance.YearFK

-- ===== qrySetupPerformanceYear =====
SELECT tblYear.YearID,tblPerformance.PortfolioFK,tblPerformance.PerformanceID,tblPerformance.YearFK FROM [tblPerformance],[tblPortfolio],[tblYear] ORDER BY tblYear.YearID

-- ===== qrySP =====
SELECT tblAccountOwner.AccountOwner,[AccountOwner] & "  -  " & [YearID],tblYear.YearID,tblPortfolio.PortfolioName,tblPerformance.Q0,tblPerformance.Q1,tblPerformance.Q2,tblPerformance.Q3,tblPerformance.Q4 FROM [tblAccountOwner],[tblPerformance],[tblPortfolio],[tblPortfolioType],[tblYear] WHERE (((tblYear.YearID)=2024) AND ((tblPortfolio.PortfolioTypeFK)=6)) ORDER BY tblAccountOwner.AccountOwner

-- ===== qryYear =====
SELECT tblYear.YearID,tblYear.Notes FROM [tblYear] ORDER BY tblYear.YearID DESCENDING

-- ===== qryYearEnd =====
SELECT tblYear.YearID,tblPortfolio.PortfolioName,tblPerformance.Q0,tblPerformance.Q4 FROM [tblPortfolio],[tblPerformance],[tblYear] ORDER BY tblYear.YearID DESCENDING

-- ===== qryYearEndTotals OLD =====
SELECT tblYear.YearID,tblAccountOwner.AccountOwner,Sum(IIf([Q4] Is Null,IIf([Q3] Is Null,IIf([Q2] Is Null,IIf([Q1] Is Null,"",[Q1]),[Q2]),[Q3]),[Q4])),Sum([Q1Cont]+[Q2Cont]+[Q3Cont]+[Q4Cont]),Sum([Q1Fees]+[Q2Fees]+[Q3Fees]+[Q4Fees]) FROM [tblPerformance],[tblYear],[tblAccountOwner],[tblPortfolioType],[tblPortfolio] ORDER BY tblYear.YearID DESCENDING

-- ===== qryYearlyTotals =====
SELECT tblPerformance.YearFK,Sum(tblPerformance.Q4),tblPortfolioType.PortfolioType FROM [tblPerformance],[tblPortfolio],[tblPortfolioType] ORDER BY tblPerformance.YearFK

-- ===== qrySetupPortfolio =====
SELECT tblAccountOwner.AccountOwner,tblPortfolioType.PortfolioType,tblPortfolio.PortfolioID,tblPortfolio.AccountOwnerFK,tblPortfolio.PortfolioTypeFK,tblPortfolio.PortfolioName FROM [tblAccountOwner],[tblPortfolio],[tblPortfolioType] ORDER BY tblPortfolio.PortfolioTypeFK

-- ===== qryYearEndTotals =====
SELECT tblYear.YearID,tblAccountOwner.AccountOwner,Sum(IIf([Q4] Is Null,IIf([Q3] Is Null,IIf([Q2] Is Null,IIf([Q1] Is Null,"",[Q1]),[Q2]),[Q3]),[Q4])),Sum([Q1Cont]+[Q2Cont]+[Q3Cont]+[Q4Cont]) FROM [tblPerformance],[tblYear],[tblAccountOwner],[tblPortfolioType],[tblPortfolio] ORDER BY tblYear.YearID DESCENDING

