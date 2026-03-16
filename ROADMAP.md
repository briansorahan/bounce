# Prioritzed Features

See the brainstorming section for the full description of what each of these ideas actually entails.

* Visualization
* Projects
* Audio Recording
* Normalization
* Scripts
* Multiline Editing
* Staging Area

# Brainstorming

## Staging Area

The idea here would be that the audio stored in the main Bounce database is just stuff that the user
has elected to store from a given session, and that maybe a lot of the audio generated during a
session is ok to throw away when the application is closed. Maybe by default audio is always stored
to this temporary staging area and is only written to the main database when the user wants this.
One problem with this idea though is that users should be able to close Bounce and resume their
previous session. It might be surprising to users that work gets thrown away automatically
unless you explicitly save it to the main database.
We would need to think through how the provenance would work in this case, because
with just one database (which is how the application currently works) we can use the features_links
table to link samples with features, and in the case where a feature generates new samples
e.g. OnsetSlice, we can trace the lineage of each slice back to the source sample.
In a sense, this means that there is no such thing as destructive editing in Bounce.
But this also means that if we were going to require users to move a sample from their staging
area to the permanent storage, it raises the question of would we copy the entire lineage to
maintain that?
Probably not...
Maybe the main database is _just_ for audio?

## Multiline Editing

I know that this does not work very well right now.
We should take a look at making it work better!

## Scripts

It would be cool if users had a way to define their own scripts and invoke these
from the REPL.
This would probably mean that we need to define a javascript editor interface.
Could be cool, but feels like a big lift!

## Visualization

Would be nice to figure out a vis API that would give users fine-grained control over
how they are visualizing the data in Bounce.
We already have some of this built out, but it just happens randomly when you're
executing commands.

## Audio Recording

I would love to be able to record samples directly into Bounce.
I think this would necessitate an API for listing the system's audio input devices
and selecting which one you want to use to record.

## Normalization

I would like to be able to normalize a sample!
There may be some other kinds of gain adjustments we could apply.

## Runtime Introspection

There could be an API that allows you to see the variables you've defined in the current
session along with their values.

## Projects

All the state of the application could be stored in "projects".
There would be a "default" project that is a fallback.
There would be an API under the proj object:
* proj.list(NAME)
* proj.rm(NAME)
* proj.load(NAME)

The load function would create a new project if you specify a name that doesn't yet exist.
Projects would save the state of the interpreter i.e. any variables/functions/etc that you
had defined, as well as the state of the UI.

I think the samples would also be organized into projects as well.
