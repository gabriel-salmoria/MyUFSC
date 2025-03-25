## TODO


### ui elements
[ ] correct the lines so that they connect perfectly
[x] centralize the infoBanner


### user experience
[ ] add possibility to put multiple courses in the progress (student failed the course)
[ ] add frequency verification, make a switch to FS or FI
[ ] remove the ability to move "Optativa" courses around


### better coding, clean code
[ ] change behavior of course modification, deep copy is extremely bad
[ ] refactor code so that main page file is not so goddamn big

[ ] move creation of the empty semesters to the student parser so that we don't create nothing at runtime

[ ] organize the schedule.json so that it has a better structure (follow cagr rules)
[ ] add the class locations to the stats and in json

[ ] move ui constants to a configuration file so that everything is nice and organized


### functionallity completion
[ ] update the timetable when adding a course to the current phase
[ ] add multiple plans chooser the student visualizer
[ ] add a chooser for the current phase on the timetable
[ ] add the multiple parts gemini parsing (structure the script and the pattern)