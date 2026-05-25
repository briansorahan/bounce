CXX ?= c++
AR ?= ar

REPO_ROOT := $(shell git rev-parse --show-toplevel)
THIRD_PARTY := $(REPO_ROOT)/third_party

CXXFLAGS := -std=c++17 -fPIC -O2 -DEIGEN_NO_DEBUG \
    -I$(THIRD_PARTY)/flucoma-core/include \
    -I$(THIRD_PARTY)/eigen \
    -I$(THIRD_PARTY)/hisstools \
    -I$(THIRD_PARTY)/memory/install/include/foonathan \
    -I$(REPO_ROOT)/native/include

HISSTOOLS_SRC := $(THIRD_PARTY)/hisstools/HISSTools_FFT/HISSTools_FFT.cpp

SRCS := flucoma.cpp
OBJS := flucoma.o hisstools_fft.o
LIB := libflucoma.a

.PHONY: all clean

all: $(LIB)

$(LIB): $(OBJS)
	$(AR) rcs $@ $^

flucoma.o: flucoma.cpp flucoma.h
	$(CXX) $(CXXFLAGS) -c $< -o $@

hisstools_fft.o: $(HISSTOOLS_SRC)
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(LIB)
