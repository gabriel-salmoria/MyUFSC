import json
import re

def clean_text(text):
    # Remove page headers and footers
    text = re.sub(r'Curso: Currículo:.*?Habilitação:.*?\n', '', text, flags=re.MULTILINE)
    # Remove multiple spaces and normalize newlines
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def extract_metadata(text):
    metadata = {
        "id": "cs-208",
        "name": "CIÊNCIAS DA COMPUTAÇÃO",
        "department": "Bacharelado em Ciências da Computação",
        "totalPhases": 8
    }
    
    # Try to extract course name and department from header
    header_match = re.search(r'208 - (.*?)\s+20071.*?Habilitação:\s*(.*?)(?:\n|$)', text)
    if header_match:
        metadata["name"] = header_match.group(1).strip()
        metadata["department"] = header_match.group(2).strip()
    
    return metadata

def find_phase(text, pos):
    # Look backwards from pos to find the most recent phase number
    text_before = text[:pos]
    phase_matches = list(re.finditer(r'\b0(\d)\b', text_before))
    if phase_matches:
        return int(phase_matches[-1].group(1))
    return 1

def extract_course_name(text):
    # Remove any trailing course codes
    name = re.sub(r'\s+[A-Z]{3}\d{4}.*$', '', text)
    # Remove any trailing Ob/Op and numbers
    name = re.sub(r'\s+(?:Ob|Op)\s+\d+.*$', '', name)
    # Remove any trailing parentheses and their contents
    name = re.sub(r'\s*\([^)]*\)\s*$', '', name)
    # Clean up any remaining whitespace
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def extract_prerequisites(text):
    prereqs = []
    # Look for prerequisites in various formats
    patterns = [
        r'(?:Pré-Requisito|Pre-Requisito)s?:?\s*([A-Z]{3}\d{4}(?:\s*(?:ou|eh|e)\s*[A-Z]{3}\d{4})*)',
        r'(?:Pré-Requisito|Pre-Requisito)s?:?\s*([A-Z]{3}\d{4}(?:\s*[A-Z]{3}\d{4})*)',
        r'(?<=\s)([A-Z]{3}\d{4}(?:\s*(?:ou|eh|e)\s*[A-Z]{3}\d{4})*)\s*(?=\s*(?:Ob|Op))',
        r'(?<=\s)([A-Z]{3}\d{4}(?:\s*(?:ou|eh|e)\s*[A-Z]{3}\d{4})*)\s+(?=\d+\s+\d+)'
    ]
    
    # First try to find explicit prerequisites
    for pattern in patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            prereq_str = match.group(1)
            # Extract individual course codes
            codes = re.findall(r'[A-Z]{3}\d{4}', prereq_str)
            prereqs.extend(codes)
    
    # If no explicit prerequisites found, look for course codes that appear before the current course
    if not prereqs:
        # Find all course codes in the text before the current position
        all_codes = re.findall(r'[A-Z]{3}\d{4}', text)
        if len(all_codes) > 1:  # If there are multiple codes
            # Only consider codes that appear in a reasonable range
            max_codes = 3  # Maximum number of implicit prerequisites to consider
            prereqs.extend(all_codes[-min(max_codes + 1, len(all_codes)):-1])
    
    return list(set(prereqs))  # Remove duplicates

def extract_equivalents(text):
    equivalents = []
    # Look for equivalents in parentheses
    matches = re.finditer(r'\(([A-Z]{3}\d{4}(?:\s*(?:ou|eh)\s*[A-Z]{3}\d{4})*)\)', text)
    for match in matches:
        equiv_str = match.group(1)
        equivalents.extend(re.findall(r'[A-Z]{3}\d{4}', equiv_str))
    
    return list(set(equivalents))  # Remove duplicates

def extract_description(text, pos):
    # Look for the description before the course code
    # First get some text before the current position
    start_pos = max(0, pos - 800)  # Look up to 800 chars before the course code
    before_text = text[start_pos:pos].strip()
    
    # Find the last empty line or another course code before this one
    match = re.search(r'(?:\n\s*\n|[A-Z]{3}\d{4})([^\n]+(?:\n[^\n]+)*)$', before_text)
    if match:
        desc = match.group(1).strip()
        
        # Clean up the description
        desc = re.sub(r'\b[A-Z]{3}\d{4}\b', '', desc)
        desc = re.sub(r'\([A-Z]{3}\d{4}(?:\s*(?:ou|eh|e)\s*[A-Z]{3}\d{4})*\)', '', desc)
        desc = re.sub(r'(?:Pré-Requisito|Pre-Requisito)s?:?\s*.*?(?=\s*[A-Z]{3}\d{4}|\s*$)', '', desc, flags=re.IGNORECASE)
        desc = re.sub(r'Equivalente(?:s)?:?\s*.*?(?=\s*[A-Z]{3}\d{4}|\s*$)', '', desc, flags=re.IGNORECASE)
        
        # Clean up the text
        desc = clean_text(desc)
        
        # Remove any remaining course-related markers
        desc = re.sub(r'\s*(?:Ob|Op)\s*\d+\s*\d+\s*', ' ', desc)
        desc = re.sub(r'\s+', ' ', desc)
        
        return desc.strip()
    
    return ""

def find_courses(text):
    # Find all course entries in the text with various patterns
    # Regular pattern: AAANNNN Name Ob/Op NN NN
    course_pattern1 = r'([A-Z]{3}\d{4})\s+((?:(?!(?:Ob|Op)\s+\d{2,3}\s+\d).)*?)(?=\s+(Ob|Op)\s+(\d+)\s+(\d+))'
    
    # Pattern with dates: AAANNNN Name Date Ob/Op NN NN
    course_pattern2 = r'([A-Z]{3}\d{4})\s+((?:(?!\d{2}/\d{2}/\d{4}).)*?)(?:\s+\d{2}/\d{2}/\d{4}(?:\s+\d{2}:\d{2})?)?\s+(Ob|Op)\s+(\d+)\s+(\d+)'
    
    courses = []
    seen_codes = set()
    
    # First pass with normal pattern
    for match in re.finditer(course_pattern1, text):
        code, name_raw, course_type_str, workload, credits = match.groups()
        
        # Skip if we've already seen this course code
        if code in seen_codes:
            continue
        seen_codes.add(code)
        
        # Get the full line and some context around it
        line_start = max(0, match.start() - 800)  # Increased context for description extraction before the course
        line_end = min(len(text), match.end() + 500)  # Context after for prerequisites
        context = text[line_start:line_end]
        
        # Clean up the name
        name = extract_course_name(name_raw)
        if not name or name.lower() in ['ou', 'eh', 'e']:
            continue
        
        # Process the course info
        course = process_course_info(code, name, course_type_str, workload, credits, context, match.start() - line_start)
        courses.append(course)
    
    # Second pass with date pattern
    for match in re.finditer(course_pattern2, text):
        code, name_raw, course_type_str, workload, credits = match.groups()
        
        # Skip if we've already seen this course code
        if code in seen_codes:
            continue
        seen_codes.add(code)
        
        # Get the full line and some context around it
        line_start = max(0, match.start() - 800)  # Increased context for description extraction before the course
        line_end = min(len(text), match.end() + 500)  # Context after for prerequisites
        context = text[line_start:line_end]
        
        # Clean up the name
        name = extract_course_name(name_raw)
        if not name or name.lower() in ['ou', 'eh', 'e']:
            continue
        
        # Process the course info
        course = process_course_info(code, name, course_type_str, workload, credits, context, match.start() - line_start)
        courses.append(course)
    
    return courses

def process_course_info(code, name, course_type_str, workload, credits, context, pos):
    # Determine course type
    course_type = "mandatory" if course_type_str == "Ob" else "optional"
    
    # Extract prerequisites and equivalents
    prereqs = extract_prerequisites(context)
    equivalents = extract_equivalents(context)
    
    # Remove self-references and duplicates
    prereqs = [p for p in prereqs if p != code]
    equivalents = [e for e in equivalents if e != code]
    
    # Extract description - now from before the course code
    description = extract_description(context, pos)
    
    # Find phase
    phase = find_phase(context, pos)
    
    course = {
        "id": code,
        "name": name,
        "type": course_type,
        "credits": int(credits),
        "workload": int(workload),
        "prerequisites": prereqs,
        "equivalents": equivalents,
        "description": description,
        "phase": phase
    }
    
    return course

def parse_course_info(text):
    # Extract metadata
    metadata = extract_metadata(text)
    
    # Find all courses
    courses = find_courses(text)
    
    # Create final structure
    course_data = metadata.copy()
    course_data["courses"] = courses
    
    return course_data

def main():
    # Read the input file
    with open('lib/example.txt', 'r', encoding='utf-8') as f:
        text = f.read()
    
    # Parse the course information
    course_data = parse_course_info(text)
    
    # Write the output to a JSON file
    with open('lib/output.json', 'w', encoding='utf-8') as f:
        json.dump(course_data, f, ensure_ascii=False, indent=2)
    
    print("Course information has been successfully parsed and saved to lib/output.json")

if __name__ == "__main__":
    main()