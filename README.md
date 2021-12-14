This repository exposes API to the database:
- Returns a Bar json object given the following values
    - /retrievePrice/:token/:timePeriodInSeconds/:startTime/:endTime
        - `Token`: Token Address
        - `TimePeriodInSeconds` : Time period that we are interested in for each bar (eg. 5min , 4hr, 1d)
        - `StartTime` : Start Time in Unixtime
        - `EndTime` : End Time in Unixtime
