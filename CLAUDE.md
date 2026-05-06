# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a single-notebook data science portfolio project that predicts customer churn for a telecom company using the [Telco Customer Churn dataset](https://www.kaggle.com/datasets/blastchar/telco-customer-churn). The analysis covers EDA, a Random Forest classifier, and feature importance extraction. The README is written in Japanese.

## Running the Notebook

The project has no package manager config. Install dependencies manually if needed:

```bash
pip install pandas numpy matplotlib seaborn scikit-learn jupyter
```

Run the notebook:

```bash
jupyter notebook "Customer Churn Prediction.ipynb"
# or non-interactively:
jupyter nbconvert --to notebook --execute "Customer Churn Prediction.ipynb"
```

## Dataset

The dataset file `WA_Fn-UseC_-Telco-Customer-Churn.csv` is **not included** in the repository. It must be downloaded from Kaggle before running the notebook. The notebook loads it from the working directory:

```python
df = pd.read_csv('WA_Fn-UseC_-Telco-Customer-Churn.csv')
```

## Notebook Architecture

The notebook is a single sequential file (`Customer Churn Prediction.ipynb`) with six cells, each labeled with a Japanese comment header (`# --- Cell N: ... ---`):

1. **Cell 1** — Imports and matplotlib global config (`xtick.direction`, `ytick.direction` set to `'in'`)
2. **Cell 2** — Load CSV, inspect shape/dtypes
3. **Cell 3** — Preprocessing: coerce `TotalCharges` to numeric, drop NaN rows, map `Churn` to 0/1, drop `customerID`, apply `pd.get_dummies(drop_first=True)`
4. **Cell 4** — EDA visualizations saved as PNG: `churn_rate_pie.png`, `churn_by_contract.png`
5. **Cell 5** — Train/test split (80/20, `random_state=42`), `RandomForestClassifier(n_estimators=100, random_state=42)`, accuracy + classification report
6. **Cell 6** — Top-10 feature importances extracted and saved as `feature_importance.png`

## Key Conventions

- All chart outputs are saved as PNG files in the repository root using `bbox_inches='tight'`.
- `random_state=42` is used throughout for reproducibility.
- One-hot encoding uses `drop_first=True` to avoid multicollinearity.
- The encoded DataFrame is kept as a separate variable (`df_encoded`) from the original `df`, which is used for visualizations before encoding.
- Cell comments/documentation are written in Japanese.
