# TODO List

## UI Elements
[ ] correct the lines so that they connect perfectly
[x] centralize the infoBanner

## User Experience
[ ] add possibility to put multiple courses in the progress (student failed the course)
[ ] add frequency verification, make a switch to FS or FI
[ ] remove the ability to move "Optativa" courses around

## Better Coding, Clean Code
[x] change behavior of course modification, deep copy is extremely bad
[x] refactor code so that main page file is not so goddamn big

[x] move creation of the empty semesters to the student parser so that we don't create nothing at runtime

[x] organize the schedule.json so that it has a better structure (follow cagr rules)
[x] add the class locations to the stats and in json

[x] move ui constants to a configuration file so that everything is nice and organized

## Functionality Completion
[ ] update the timetable when adding a course to the current phase
[ ] add multiple plans chooser the student visualizer
[ ] add a chooser for the current phase on the timetable
[ ] add the multiple parts gemini parsing (structure the script and the pattern) 