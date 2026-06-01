from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.db import transaction
from django.core.files.storage import default_storage
from django.conf import settings
from django.core.mail import send_mail
from django.utils.timezone import now
from django.utils import timezone
from django.db import models
from django.db.models import Q
import json
from urllib.parse import unquote
import uuid
import time
import requests
from datetime import timedelta, datetime
from dateutil.relativedelta import relativedelta
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .jwt_utils import generate_jwt_token, jwt_required
from .models import (
    Owners, StayHostelDetails, ApartmentStayDetails, CommericialDetails,
    Tenent, HostelFloorRoom, ApartmentFloorUnit, CommercialFloor,
    TenantBeds, ApartmentTenantBeds, CommercialTenantBeds, JoinRequest,
    Issue, Payment, BankDetails, Expense, Notification
)
from .serializers import (
    OwnerRegistrationSerializer, HostelSerializer, ApartmentSerializer,
    CommercialSerializer, BankSerializer, TenentSerializer,
    TenantLoginSerializer, OwnerLoginSerializer, TenantBedSerializer, IssueSerializer,
    PaymentSerializer, ApartmentBedSerializer, CommercialBedSerializer, ExpenseSerializer
)

@api_view(['GET'])
@jwt_required()
def admin_home(request):
    """
    Returns summary counts for the Admin Dashboard.
    """
    try:
        data = {
            "total_owners": Owners.objects.filter(status='active').count(),
            "pending_owners": Owners.objects.filter(status='pending').count(),
            "suspended_owners": Owners.objects.filter(status='suspend').count(),
            "total_properties": (
                StayHostelDetails.objects.count() + 
                ApartmentStayDetails.objects.count() + 
                CommericialDetails.objects.count()
            ),
            "total_tenants": Tenent.objects.count(),
        }
        return Response({"data": data}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)




@api_view(['GET'])
@jwt_required()
def get_all_property_basic_details(request):
    """
    Returns basic details of all properties for the Properties page.
    """
    property_list = []
 
    def build_file_url(file_field):
        if file_field:
            try:
                return request.build_absolute_uri(file_field.url)
            except Exception:
                return None
        return None
 
    # Hostels
    hostels = StayHostelDetails.objects.select_related('owner').all()
    for h in hostels:
        property_list.append({
            "phone": h.owner.phone if h.owner else "N/A",
            "property_type": "hostel",
            "name": h.hostelName or "Unnamed Hostel",
            "location": h.location,
            "owner_name": h.owner.name if h.owner else "Unknown",
            "owner_status": h.owner.status if h.owner else "pending",
        })
 
    # Apartments
    apartments = ApartmentStayDetails.objects.select_related('owner').all()
    for a in apartments:
        property_list.append({
            "phone": a.owner.phone if a.owner else "N/A",
            "property_type": "apartment",
            "name": a.apartmentName or "Unnamed Apartment",
            "location": a.location,
            "owner_name": a.owner.name if a.owner else "Unknown",
            "owner_status": a.owner.status if a.owner else "pending",
        })
 
    # Commercial
    commercials = CommericialDetails.objects.select_related('owner').all()
    for c in commercials:
        property_list.append({
            "phone": c.owner.phone if c.owner else "N/A",
            "property_type": "commercial",
            "name": c.commercialName or "Unnamed Commercial",
            "location": c.location,
            "owner_name": c.owner.name if c.owner else "Unknown",
            "owner_status": c.owner.status if c.owner else "pending",
        })
 
    return Response({"data": property_list}, status=status.HTTP_200_OK)
 

@api_view(['GET'])
@jwt_required()
def get_payment_details(request, phone):
    """
    Returns payment details summary for an owner or property.
    """
    try:
        # Check hostels
        hostel = StayHostelDetails.objects.filter(owner__phone=phone).first()
        if hostel:
            return Response({"data": {"upi_id": hostel.upi_id, "rent": hostel.rent}}, status=status.HTTP_200_OK)
           
        # Check apartments
        apt = ApartmentStayDetails.objects.filter(owner__phone=phone).first()
        if apt:
            return Response({"data": {"upi_id": apt.upi_id, "rent": apt.rent}}, status=status.HTTP_200_OK)
           
        return Response({"error": "No payment details found"}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



 

@api_view(['POST'])
@jwt_required()
def suspension_reason(request):
    """
    Saves or updates the suspension reason for an owner.
    """
    phone = request.data.get("phone")
    reason = request.data.get("reason")

    if not phone:
        return Response({"error": "phone is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone=phone)).order_by('-created_at').first()
        if not owner:
            raise Owners.DoesNotExist
        owner.suspension_reason = reason
        owner.save()
        return Response({"message": "Suspension reason saved successfully"}, status=status.HTTP_200_OK)
    except Owners.DoesNotExist:
        return Response({"error": "Owner not found"}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)




@api_view(['GET', 'DELETE'])
@jwt_required()
def get_suspension_reason(request, phone):
    """
    Retrieves or deletes the suspension record for a specific owner.
    """
    try:
        owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone=phone)).order_by('-created_at').first()
        if not owner:
            raise Owners.DoesNotExist
        
        if request.method == 'DELETE':
            owner.delete()
            return Response({"message": "Account record cleared for re-registration"}, status=status.HTTP_200_OK)
            
        return Response({
            "phone": owner.phone,
            "reason": owner.suspension_reason or "No reason provided"
        }, status=status.HTTP_200_OK)
    except Owners.DoesNotExist:
        return Response({"error": "Owner not found"}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



@api_view(['POST'])
@transaction.atomic
def register_owner(request):
    print("--- REGISTRATION ATTEMPT ---")
    print("Request Data:", request.data)
    print("Request Files:", request.FILES)
 
    stay_type = request.data.get("stayType")
 
    if stay_type not in ["hostel", "apartment", "commercial"]:
        return Response(
            {"error": "Invalid stayType"},
            status=status.HTTP_400_BAD_REQUEST
        )
 
    try:
        # =========================
        # 1️⃣ OWNER
        # =========================
        data = request.data.copy()
        phone = data.get("phone") or data.get("phone_number")
        if phone:
            if len(phone) < 10:
                phone = phone[-10:]
            data["phone"] = phone
            if not data.get("name"):
                data["name"] = f"Owner {phone}"
            
            if not data.get("password"):
                data["password"] = "nopassword"
               
        owner_serializer = OwnerRegistrationSerializer(data=data)
 
        if not owner_serializer.is_valid():
            print("OWNER SERIALIZER ERRORS:", owner_serializer.errors)
 
            return Response(
                owner_serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
 
        owner = owner_serializer.save(status='pending')
 
        # =========================
        # 2️⃣ FACILITIES
        # =========================
        FACILITY_FIELDS = [
            "wifi", "parking", "food", "lift", "power_backup",
            "security", "play_area", "mess", "laundry",
            "water", "ac", "non_ac",
        ]
 
        facilities_raw = request.data.get("facilities")
        facilities = []
 
        # ✅ Priority 1: facilities array
        if facilities_raw:
            try:
                if isinstance(facilities_raw, str):
                    parsed = json.loads(facilities_raw)
 
                elif isinstance(facilities_raw, list):
                    parsed = facilities_raw
 
                else:
                    parsed = []
 
                facilities = list(set([
                    str(f).lower().strip()
                    for f in parsed if f
                ]))
 
            except Exception as e:
                print("FACILITY PARSE ERROR:", e)
 
        # ✅ Priority 2: fallback booleans
        else:
            facilities = [
                field for field in FACILITY_FIELDS
                if str(request.data.get(field)).lower() == "true"
            ]
 
        print("FINAL FACILITIES:", facilities)
 
        # =========================
        # 3️⃣ GALLERY IMAGES
        # =========================
        uploaded_gallery_files = request.FILES.getlist("gallery_images")
 
        gallery_file_paths = []
 
        for file in uploaded_gallery_files:
            saved_path = default_storage.save(
                f"property_gallery/{file.name}",
                file
            )
 
            gallery_file_paths.append(saved_path)
 
        # =========================
        # 4️⃣ PROPERTY DATA
        # =========================
        property_data = request.data.dict()
 
        property_data.pop("facilities", None)
        property_data.pop("gallery_images", None)
        property_data.pop("building_layout", None)
 
        property_data["owner"] = owner.pk
        property_data["facilities"] = facilities
        property_data["gallery_images"] = gallery_file_paths
        
        cover_image = request.FILES.get("cover_image")
        if cover_image:
            property_data["cover_image"] = cover_image
            
        if not property_data.get("rent_amount"):
            property_data.pop("rent_amount", None)
            
        if not property_data.get("furnishing_type"):
            property_data.pop("furnishing_type", None)
 
        # =========================
        # 5️⃣ SAVE PROPERTY
        # =========================
        if stay_type == "hostel":
            serializer = HostelSerializer(data=property_data)
 
        elif stay_type == "apartment":
            serializer = ApartmentSerializer(data=property_data)
 
        else:
            serializer = CommercialSerializer(data=property_data)
 
        if not serializer.is_valid():
            print("PROPERTY ERRORS:", serializer.errors)
 
            transaction.set_rollback(True)
 
            return Response(
                serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
 
        property_obj = serializer.save()
 
        # =========================
        # 6️⃣ FLOOR / BUILDING LAYOUT
        # =========================
        building_layout = request.data.get("building_layout")
 
        if building_layout:
 
            try:
                layout = json.loads(building_layout)
 
            except json.JSONDecodeError:
                transaction.set_rollback(True)
 
                return Response(
                    {"error": "Invalid building_layout JSON"},
                    status=status.HTTP_400_BAD_REQUEST
                )
 
            for floor_data in layout:
 
                floor_no = floor_data.get("floorNo")
 
                # -------- HOSTEL --------
                if stay_type == "hostel":
 
                    for room in floor_data.get("rooms", []):
 
                        HostelFloorRoom.objects.create(
                            owner=owner,
                            hostel=property_obj,
                            floor=floor_no,
                            roomNo=room.get("roomNo"),
                            sharing=room.get("beds")
                        )
 
                # -------- APARTMENT --------
                elif stay_type == "apartment":
 
                    for flat in floor_data.get("flats", []):
 
                        ApartmentFloorUnit.objects.create(
                            owner=owner,
                            apartment=property_obj,
                            floor=floor_no,
                            flatNo=flat.get("flatNo"),
                            bhk=flat.get("bhk")
                        )
 
                # -------- COMMERCIAL --------
                elif stay_type == "commercial":
 
                    for section in floor_data.get("sections", []):
 
                        CommercialFloor.objects.create(
                            owner=owner,
                            commercial_property=property_obj,
                            floorNo=floor_no,
                            sectionNo=section.get("sectionNo"),
                            area_sqft=section.get("area")
                        )
 
        # =========================
        # ✅ FINAL RESPONSE
        # =========================
        token = generate_jwt_token(owner.pk, 'owner')
        return Response(
            {
                "message": "Registration successful. Wait for approval (2 days)",
                "status": owner.status,
                "created_at": owner.created_at,
                "phone": owner.phone,
                "owner_id": owner.pk,
                "token": token
            },
            status=status.HTTP_201_CREATED
        )
 
    except Exception as e:
 
        print("GLOBAL ERROR:", str(e))
 
        transaction.set_rollback(True)
 
        return Response(
            {
                "error": "Something went wrong",
                "details": str(e)
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
def register_tenent(request):
    print("Request Data:", request.data)
    print("Request Files:", request.FILES)

    data = request.data.copy()
    phone = data.get("phone") or data.get("phone_number")
    if phone and len(phone) < 10:
        data["phone"] = phone[-10:]
        
    serializer = TenentSerializer(data=data)
    if serializer.is_valid():
        tenant = serializer.save()
        token = generate_jwt_token(tenant.id, 'tenant')
        return Response(
            {
                "message": "Tenent registered successfully",
                "token": token,
                "data": serializer.data
            },
            status=status.HTTP_201_CREATED)
    return Response(
        {
            "message": "Validation Error",
            "errors": serializer.errors
        },
        status=status.HTTP_400_BAD_REQUEST
    )

@api_view(['POST'])
@jwt_required()
def save_push_token(request):
    try:
        phone = request.data.get('phone')
        role = request.data.get('role')
        token = request.data.get('push_token')

        if not phone or not role or not token:
            return Response({"error": "Missing parameters"}, status=status.HTTP_400_BAD_REQUEST)

        if role == 'tenant':
            user = Tenent.objects.get(phone=phone)
        elif role == 'owner':
            user = Owners.objects.filter(Q(owner_id=phone) | Q(phone=phone)).order_by('-created_at').first()
            if not user:
                raise Owners.DoesNotExist
        else:
            return Response({"error": "Invalid role"}, status=status.HTTP_400_BAD_REQUEST)

        user.push_token = token
        user.save()
        return Response({"message": "Push token saved successfully"}, status=status.HTTP_200_OK)

    except (Tenent.DoesNotExist, Owners.DoesNotExist):
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
def tenant_login(request):

    serializer = TenantLoginSerializer(data=request.data)

    if serializer.is_valid():

        phone = serializer.validated_data['phone']
        password = serializer.validated_data['password']

        try:
            tenant = Tenent.objects.get(phone=phone)

            if tenant.password == password:
                # Generate JWT token
                token = generate_jwt_token(user_id=tenant.id, role='tenant', phone=tenant.phone)
                
                return Response({
                    "message": "Login Successful",
                    "tenant_id": tenant.id,
                    "name": tenant.name,
                    "phone": tenant.phone,
                    "token": token
                }, status=status.HTTP_200_OK)

            else:
                return Response({
                    "error": "Invalid Password"
                }, status=status.HTTP_400_BAD_REQUEST)

        except Tenent.DoesNotExist:
            return Response({
                "error": "phone not registered"
            }, status=status.HTTP_404_NOT_FOUND)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def owner_login(request):
    serializer = OwnerLoginSerializer(data=request.data)
 
    if serializer.is_valid():
        phone = serializer.validated_data['phone']
        password = serializer.validated_data['password']
 
        try:
            owners = Owners.objects.filter(phone=phone)
            if not owners.exists():
                raise Owners.DoesNotExist
            
            owner = None
            for o in owners:
                if o.password == password:
                    owner = o
                    break
            
            if not owner:
                return Response(
                    {"error": "Invalid Password"},
                    status=status.HTTP_400_BAD_REQUEST
                )
           
            if owner.status == "pending":
                return Response(
                    {"error": "Your account is pending approval",
                     "status" : owner.status,
                     "message": "Please wait for the admin to approval"
                     },
                    status=status.HTTP_401_UNAUTHORIZED
                )
            if owner.status == "suspend":
                return Response(
                    {
                        "error" : "Your account is Suspeded",
                        "status" : owner.status,
                        "message" : "Please contact admin"
                    },
                    status = status.HTTP_403_FORBIDDEN
                )
            if owner.status == "active" and owner.password == password:
                # Generate JWT token
                token = generate_jwt_token(user_id=owner.pk, role='owner', phone=owner.phone)
                
                return Response(
                    {
                        "message": "Login Successful",
                        "token": token
                    },
                    status = status.HTTP_200_OK
                )
            
            return Response(
                {"error": "Invalid Password"},
                status=status.HTTP_400_BAD_REQUEST
                )
 
        except Owners.DoesNotExist:
            return Response(
                {"error": "Owner not found"},
                status=status.HTTP_404_NOT_FOUND
            )
 
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def admin_login(request):
    """
    Admin login endpoint. Hardcoded credentials for now.
    """
    phone = request.data.get('phone')
    password = request.data.get('password')
    
    if phone == "admin@stayefy.com" and password == "admin123":
        token = generate_jwt_token(user_id=1, role='admin', phone=phone)
        return Response({
            "message": "Login Successful",
            "token": token
        }, status=status.HTTP_200_OK)
    
    return Response({"error": "Invalid phone or password"}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
def get_hostel_step3(request, phone):

    try:
        owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone=phone)).order_by('-created_at').first()
        if not owner:
            raise Owners.DoesNotExist
    except Owners.DoesNotExist:
        return Response({"error": "Owner not found"}, status=404)

    # Get objects safely
    hostel = StayHostelDetails.objects.filter(owner=owner).first()
    apartment = ApartmentStayDetails.objects.filter(owner=owner).first()
    commercial = CommericialDetails.objects.filter(owner=owner).first()

    response_data = {}

    # ================= HOSTEL =================
    if hostel is not None:

        floors = HostelFloorRoom.objects.filter(hostel=hostel)

        layout = {}

        for room in floors:
            floor_no = room.floor

            if floor_no not in layout:
                layout[floor_no] = []

            layout[floor_no].append({
                "roomNo": room.roomNo,
                "beds": room.sharing
            })

        result = []

        for floor_no, rooms in layout.items():
            result.append({
                "floorNo": floor_no,
                "rooms": rooms
            })

        response_data = {
            "property_type": "hostel",
            "name": hostel.hostelName,
            "address": hostel.location,
            "building_layout": result
        }

    # ================= APARTMENT =================
    elif apartment is not None:

        floors = ApartmentFloorUnit.objects.filter(apartment=apartment)

        layout = {}

        for flat in floors:
            floor_no = flat.floor

            if floor_no not in layout:
                layout[floor_no] = []

            layout[floor_no].append({
                "flatNo": flat.flatNo,
                "bhk": flat.bhk
            })

        result = []

        for floor_no, flats in layout.items():
            result.append({
                "floorNo": floor_no,
                "flats": flats
            })

        response_data = {
            "property_type": "apartment",
            "name": apartment.apartmentName,
            "address": apartment.location,
            "building_layout": result
        }

    # ================= COMMERCIAL =================
    elif commercial is not None:

        floors = CommercialFloor.objects.filter(commercial_property=commercial).order_by('floorNo', 'sectionNo')

        layout_dict = {}
        for floor in floors:
            floor_no = floor.floorNo
            if floor_no not in layout_dict:
                layout_dict[floor_no] = []
            layout_dict[floor_no].append({
                "sectionNo": floor.sectionNo,
                "area_sqft": floor.area_sqft
            })

        layout = [
            {"floorNo": floor_no, "sections": sections}
            for floor_no, sections in layout_dict.items()
        ]

        response_data = {
            "property_type": "commercial",
            "name": commercial.commercialName,
            "address": commercial.location,
            "building_layout": layout
        }

    else:
        return Response({"error": "No property found for this owner"}, status=404)

    # ================= OWNER INFO =================
    # response_data["owner"] = {
        
    #     "id": owner.pk,
    #     "name": owner.name,
    #     "phone": owner.phone,
    #     "phone": owner.phone
    # }
    response_data["owner"] = {
        "id": owner.pk,
        "name": owner.name,
        "phone": owner.phone
    }

    print("API Response:", response_data)

    return Response(response_data)

@api_view(['GET'])
@jwt_required()
def get_properties_listing(request):
    property_list = []
 
    def build_gallery_urls(gallery_list):
        if not gallery_list:
            return []
        return [
            request.build_absolute_uri(settings.MEDIA_URL + path)
            for path in gallery_list
        ]
 
    hostels = StayHostelDetails.objects.select_related('owner').filter(owner__status='active')
    for hostel in hostels:
       property_list.append({
    "id": str(hostel.id),
    "type": "Hostel",
    "hostelType": hostel.hostelType.capitalize() if hostel.hostelType else None,
    "name": hostel.hostelName,
    "address": hostel.location,
    "contact": hostel.owner.phone if hostel.owner else None,
    "owner_phone": hostel.owner.phone if hostel.owner else None,
    "owner_id": hostel.owner.owner_id if hostel.owner else None,
    "owner_name": hostel.owner.name if hostel.owner else None,
    "latitude": float(hostel.latitude) if hostel.latitude else None,
    "longitude": float(hostel.longitude) if hostel.longitude else None,
    "gallery": build_gallery_urls(hostel.gallery_images),
    "image": hostel.cover_image.name if hostel.cover_image else None,
    "rent": str(hostel.rent_amount) if hostel.rent_amount else None,
    "isAvailable": True,
    "rating": None,
    "facilities": hostel.facilities if hostel.facilities else [],
})
    apartments = ApartmentStayDetails.objects.select_related('owner').filter(owner__status='active')
    for apartment in apartments:
        allowed_tenants = None
        if apartment.tenantType == "family":
            allowed_tenants = "FamilyOnly"
        elif apartment.tenantType == "bachelors":
            allowed_tenants = "BachelorsOnly"
 
        property_list.append({
            "id": str(apartment.id),
            "type": "Apartment",
            "name": apartment.apartmentName,
            "address": apartment.location,
            "contact": apartment.owner.phone if apartment.owner else None,
            "owner_phone": apartment.owner.phone if apartment.owner else None,
            "owner_id": apartment.owner.owner_id if apartment.owner else None,
            "owner_name": apartment.owner.name if apartment.owner else None,
            "latitude": float(apartment.latitude) if apartment.latitude else None,
            "longitude": float(apartment.longitude) if apartment.longitude else None,
            "gallery": build_gallery_urls(apartment.gallery_images),
            "image": apartment.cover_image.name if apartment.cover_image else None,
            "rent": str(apartment.rent_amount) if apartment.rent_amount else None,
            "isAvailable": True,
            "rating": None,
            "facilities": apartment.facilities if apartment.facilities else [],
            "allowedTenants": allowed_tenants,
        })
 
    commercials = CommericialDetails.objects.select_related('owner').filter(owner__status='active')
    for commercial in commercials:
        property_list.append({
            "id": str(commercial.id),
            "type": "Commercial",
            "name": commercial.commercialName,
            "address": commercial.location,
            "contact": commercial.owner.phone if commercial.owner else None,
            "owner_phone": commercial.owner.phone if commercial.owner else None,
            "owner_id": commercial.owner.owner_id if commercial.owner else None,
            "owner_name": commercial.owner.name if commercial.owner else None,
            "latitude": float(commercial.latitude) if commercial.latitude else None,
            "longitude": float(commercial.longitude) if commercial.longitude else None,
            "gallery": build_gallery_urls(commercial.gallery_images),
            "image": commercial.cover_image.name if commercial.cover_image else None,
            "rent": str(commercial.rent_amount) if commercial.rent_amount else None,
            "isAvailable": True,
            "rating": None,
            "facilities": commercial.facilities if commercial.facilities else [],
        })
 
    return Response(
        {
            "count": len(property_list),
            "data": property_list
        },
        status=status.HTTP_200_OK
    )
 


def handle_offline_tenant(data, files, owner):
    is_offline = data.get('is_offline') == 'true' or data.get('has_app') == 'false'
    if is_offline:
        aadhar_id = data.get('aadhar_id')
        if not aadhar_id:
            return None, "Aadhaar ID is required for offline tenant."
        if not aadhar_id.isdigit() or len(aadhar_id) != 12:
            return None, "Aadhaar ID must be exactly 12 numeric digits."
        
        tenant_phone = data.get('phone')
        if not tenant_phone:
            return None, "Tenant contact number is required."
        
        existing_with_aadhar = Tenent.objects.filter(aadhar_id=aadhar_id).first()
        if existing_with_aadhar and existing_with_aadhar.phone != tenant_phone:
            return None, "This Aadhaar ID is already registered to another user."
        
        t_obj = Tenent.objects.filter(phone=tenant_phone).first()
        if t_obj:
            t_obj.name = data.get('name', t_obj.name)
            t_obj.aadhar_id = aadhar_id
            if 'aadhar_image' in files:
                t_obj.aadhar_image = files['aadhar_image']
            t_obj.owner = owner
            t_obj.is_vacant = False
            t_obj.save()
        else:
            t_obj = Tenent.objects.create(
                name=data.get('name'),
                phone=tenant_phone,
                aadhar_id=aadhar_id,
                aadhar_image=files.get('aadhar_image'),
                owner=owner,
                is_vacant=False
            )
        return t_obj, None
    return None, None

@api_view(['POST'])
@jwt_required()
def registerbeds(request):
    print(" Incoming Data:", request.data)
    data = request.data.copy()
    owner_phone = data.get('owner_phone')
    owner = None
    if owner_phone:
        owner = Owners.objects.filter(Q(owner_id=owner_phone) | Q(phone=owner_phone)).order_by('-created_at').first()
        if owner:
            data['owner_phone'] = owner.owner_id

    # Handle offline tenant creation
    t_obj, err = handle_offline_tenant(data, request.FILES, owner)
    if err:
        return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)

    serializer = TenantBedSerializer(data=data)

    if serializer.is_valid():
        tenant_bed = serializer.save()
        t_obj = Tenent.objects.filter(phone=tenant_bed.phone).first()
        if t_obj:
            t_obj.is_vacant = False
            t_obj.save()
        return Response({
            "message": "Tenant Added Successfully",
            "data": serializer.data
            }, status=status.HTTP_201_CREATED)
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@jwt_required()
def registerapartmentbeds(request):
    print(" Incoming Data:", request.data)
    data = request.data.copy()
    owner_phone = data.get('owner_phone')
    owner = None
    if owner_phone:
        owner = Owners.objects.filter(Q(owner_id=owner_phone) | Q(phone=owner_phone)).order_by('-created_at').first()
        if owner:
            data['owner_phone'] = owner.owner_id

    # Handle offline tenant creation
    t_obj, err = handle_offline_tenant(data, request.FILES, owner)
    if err:
        return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)

    serializer = ApartmentBedSerializer(data=data)

    if serializer.is_valid():
        tenant_bed = serializer.save()
        t_obj = Tenent.objects.filter(phone=tenant_bed.phone).first()
        if t_obj:
            t_obj.is_vacant = False
            t_obj.save()
        return Response({
            "message": "Tenant Added Successfully",
            "data": serializer.data
            }, status=status.HTTP_201_CREATED)
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@jwt_required()
def registercommercialbeds(request):
    print(" Incoming Data:", request.data)
    data = request.data.copy()
    owner_phone = data.get('owner_phone')
    owner = None
    if owner_phone:
        owner = Owners.objects.filter(Q(owner_id=owner_phone) | Q(phone=owner_phone)).order_by('-created_at').first()
        if owner:
            data['owner_phone'] = owner.owner_id

    # Handle offline tenant creation
    t_obj, err = handle_offline_tenant(data, request.FILES, owner)
    if err:
        return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)

    serializer = CommercialBedSerializer(data=data)

    if serializer.is_valid():
        tenant_bed = serializer.save()
        t_obj = Tenent.objects.filter(phone=tenant_bed.phone).first()
        if t_obj:
            t_obj.is_vacant = False
            t_obj.save()
        print("✅ Saved data:", serializer.data)
        return Response({
            "message": "Tenant Added Successfully",
            "data": serializer.data
        }, status=status.HTTP_201_CREATED)
    
    print("❌ Validation errors:", serializer.errors)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@jwt_required()
def get_tenantsbeds(request, phone):
    owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone=phone)).first()
    owner_id = owner.owner_id if owner else phone
    tenants = TenantBeds.objects.filter(owner_phone=owner_id)
    serializer = TenantBedSerializer(tenants, many=True, context={'request': request})

    return Response({
        "message": "Tenants fetched successfully",
        "data": serializer.data
    })

@api_view(['GET'])
@jwt_required()
def get_apartmentbeds(request, phone):
    owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone=phone)).first()
    owner_id = owner.owner_id if owner else phone
    tenants = ApartmentTenantBeds.objects.filter(owner_phone=owner_id)
    serializer = ApartmentBedSerializer(tenants, many=True, context={'request': request})
    return Response({
        "message": "Tenants fetched successfully",
        "data": serializer.data
    })

@api_view(['GET'])
@jwt_required()
def get_commercialbeds(request, phone):
    owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone=phone)).first()
    owner_id = owner.owner_id if owner else phone
    tenants = CommercialTenantBeds.objects.filter(owner_phone=owner_id)
    serializer = CommercialBedSerializer(tenants, many=True, context={'request': request})
    return Response({
        "message": "Tenants fetched successfully",
        "data": serializer.data
    })


# @api_view(['DELETE'])
# def delete_hostel_tenant(request, phone):
#     tenants = TenantBeds.objects.filter(phone=phone)
#     if not tenants.exists():
#         return Response({"error": "Tenant not found"}, status=404)

#     tenants.delete()

#     return Response({
#         "message": "Tenant deleted successfully"
#     })


# @api_view(['DELETE'])
# def delete_apartment_tenant(request, phone):
#     tenants = ApartmentTenantBeds.objects.filter(phone=phone)

#     if not tenants.exists():
#         return Response({"error": "Tenant not found"}, status=status.HTTP_404_NOT_FOUND)

#     tenants.delete()

#     return Response({
#         "message": "Apartment tenant(s) deleted successfully"
#     }, status=status.HTTP_200_OK)


# @api_view(['DELETE'])
# def delete_commercial_tenant(request, phone):
#     tenants = CommercialTenantBeds.objects.filter(phone=phone)

#     if not tenants.exists():
#         return Response({"error": "Tenant not found"}, status=status.HTTP_404_NOT_FOUND)

#     tenants.delete()

#     return Response({
#         "message": "Commercial tenant(s) deleted successfully"
#     }, status=status.HTTP_200_OK)

@api_view(['DELETE'])
@jwt_required()
def delete_hostel_tenant(request, id):

    tenant = TenantBeds.objects.filter(id=id).first()

    if not tenant:
        return Response(
            {"error": "Tenant not found"},
            status=404
        )

    # Reset tenant vacancy status
    t_obj = Tenent.objects.filter(phone=tenant.phone).first()
    if t_obj:
        t_obj.is_vacant = True
        t_obj.owner = None
        t_obj.save()

    tenant.delete()

    return Response({
        "message": "Hostel tenant deleted successfully"
    })

@api_view(['DELETE'])
@jwt_required()
def delete_apartment_tenant(request, id):

    tenant = ApartmentTenantBeds.objects.filter(id=id).first()

    if not tenant:
        return Response(
            {"error": "Tenant not found"},
            status=404
        )

    # Reset tenant vacancy status
    t_obj = Tenent.objects.filter(phone=tenant.phone).first()
    if t_obj:
        t_obj.is_vacant = True
        t_obj.owner = None
        t_obj.save()

    tenant.delete()

    return Response({
        "message": "Apartment tenant deleted successfully"
    })

@api_view(['DELETE'])
@jwt_required()
def delete_commercial_tenant(request, id):

    tenant = CommercialTenantBeds.objects.filter(id=id).first()

    if not tenant:
        return Response(
            {"error": "Tenant not found"},
            status=404
        )

    # Reset tenant vacancy status
    t_obj = Tenent.objects.filter(phone=tenant.phone).first()
    if t_obj:
        t_obj.is_vacant = True
        t_obj.owner = None
        t_obj.save()

    tenant.delete()

    return Response({
        "message": "Commercial tenant deleted successfully"
    })

# @api_view(['PATCH'])
# def update_hostel_tenant(request, phone):
#     tenant = TenantBeds.objects.filter(phone=phone).first()
#     if not tenant:
#         return Response({"error": "Tenant not found"}, status=404)

#     serializer = TenantBedSerializer(tenant, data=request.data, partial=True)
#     if serializer.is_valid():
#         serializer.save()
#         return Response({"message": "Hostel tenant updated successfully", "data": serializer.data})
#     return Response(serializer.errors, status=400)

# @api_view(['PATCH'])
# def update_apartment_tenant(request, phone):
#     tenant = ApartmentTenantBeds.objects.filter(phone=phone).first()
#     if not tenant:
#         return Response({"error": "Tenant not found"}, status=404)

#     serializer = ApartmentBedSerializer(tenant, data=request.data, partial=True)
#     if serializer.is_valid():
#         serializer.save()
#         return Response({"message": "Apartment tenant updated successfully", "data": serializer.data})
#     return Response(serializer.errors, status=400)


# @api_view(['PATCH'])
# def update_commercial_tenant(request, phone):
#     tenant = CommercialTenantBeds.objects.filter(phone=phone).first()
#     if not tenant:
#         return Response({"error": "Tenant not found"}, status=404)

#     serializer = CommercialBedSerializer(tenant, data=request.data, partial=True)
#     if serializer.is_valid():
#         serializer.save()
#         return Response({"message": "Commercial tenant updated successfully", "data": serializer.data})
#     return Response(serializer.errors, status=400)


@api_view(['PATCH'])
@jwt_required()
def update_hostel_tenant(request, id):
    tenant = TenantBeds.objects.filter(id=id).first()

    if not tenant:
        return Response(
            {"error": "Tenant not found"},
            status=404
        )

    serializer = TenantBedSerializer(
        tenant,
        data=request.data,
        partial=True
    )

    if serializer.is_valid():
        serializer.save()

        return Response({
            "message": "Hostel tenant updated successfully",
            "data": serializer.data
        })

    return Response(serializer.errors, status=400)

@api_view(['PATCH'])
@jwt_required()
def update_apartment_tenant(request, id):
    tenant = ApartmentTenantBeds.objects.filter(id=id).first()

    if not tenant:
        return Response({"error": "Tenant not found"}, status=404)

    serializer = ApartmentBedSerializer(
        tenant,
        data=request.data,
        partial=True
    )

    if serializer.is_valid():
        serializer.save()

        return Response({
            "message": "Apartment tenant updated successfully",
            "data": serializer.data
        })

    return Response(serializer.errors, status=400)

@api_view(['PATCH'])
@jwt_required()
def update_commercial_tenant(request, id):
    tenant = CommercialTenantBeds.objects.filter(id=id).first()

    if not tenant:
        return Response(
            {"error": "Tenant not found"},
            status=404
        )

    serializer = CommercialBedSerializer(
        tenant,
        data=request.data,
        partial=True
    )

    if serializer.is_valid():
        serializer.save()

        return Response({
            "message": "Commercial tenant updated successfully",
            "data": serializer.data
        })

    return Response(serializer.errors, status=400)

@api_view(['GET'])
@jwt_required()
def get_all_steps_data(request):
    owners = Owners.objects.all()

    all_data = []
 
    for owner in owners:
 
        owner_data = {}
 
        # ================= STEP 1: OWNER =================

        owner_data["owner"] = {

            "id": owner.pk,

            "name": owner.name,

            "phone": owner.phone,

            "phone": owner.phone,

            "image": str(getattr(owner, 'owner_img_field', None)) if getattr(owner, 'owner_img_field', None) else None

        }
 
        # ================= STEP 2: PROPERTY =================

        hostel = StayHostelDetails.objects.filter(owner=owner).first()

        apartment = ApartmentStayDetails.objects.filter(owner=owner).first()

        commercial = CommericialDetails.objects.filter(owner=owner).first()
 
        property_data = {}

        layout_data = {}
 
        # -------- HOSTEL --------

        if hostel:

            property_data = {

                "type": "hostel",

                "name": hostel.hostelName,

                "location": hostel.location,

                "hostelType": hostel.hostelType,

                "facilities": hostel.facilities

            }
 
            floors = HostelFloorRoom.objects.filter(hostel=hostel)
 
            layout = {}

            for room in floors:

                if room.floor not in layout:

                    layout[room.floor] = []
 
                layout[room.floor].append({

                    "roomNo": room.roomNo,

                    "beds": room.sharing

                })
 
            layout_data = [

                {"floorNo": k, "rooms": v} for k, v in layout.items()

            ]
 
        # -------- APARTMENT --------

        elif apartment:

            property_data = {

                "type": "apartment",

                "name": apartment.apartmentName,

                "location": apartment.location,

                "tenantType": apartment.tenantType,

                "facilities": apartment.facilities

            }
 
            floors = ApartmentFloorUnit.objects.filter(apartment=apartment)
 
            layout = {}

            for flat in floors:

                if flat.floor not in layout:

                    layout[flat.floor] = []
 
                layout[flat.floor].append({

                    "flatNo": flat.flatNo,

                    "bhk": flat.bhk

                })
 
            layout_data = [

                {"floorNo": k, "flats": v} for k, v in layout.items()

            ]
 
        # -------- COMMERCIAL --------

        elif commercial:

            property_data = {

                "type": "commercial",

                "name": commercial.commercialName,

                "location": commercial.location,

                "usage": commercial.usage,

                "facilities": commercial.facilities

            }
 
            floors = CommercialFloor.objects.filter(commercial_property=commercial)
 
            layout_data = [

                {

                    "floorNo": f.floorNo,

                    "sectionNo": f.sectionNo,

                    "area_sqft": f.area_sqft

                }

                for f in floors

            ]
 
        else:

            property_data = {"type": None}

            layout_data = []
 
        owner_data["property"] = property_data
 
        # ================= STEP 3: LAYOUT =================

        owner_data["building_layout"] = layout_data
 
        # ================= BANK DETAILS =================

        bank = BankDetails.objects.filter(owner=owner).first()

        if bank:

            owner_data["bank"] = {

                "bankName": bank.bankName,

                "ifsc": bank.ifsc,

                "accountNo": bank.accountNo

            }

        else:

            owner_data["bank"] = None
 
        # ADD TO FINAL LIST

        all_data.append(owner_data)
 
    # ================= PRINT IN CONSOLE =================

    print("\n========= ALL OWNERS FULL DATA =========\n")

    for data in all_data:

        print(data)

        print("--------------------------------------")
 
    return Response(all_data)
 



@api_view(['GET'])
@jwt_required()
def tenantdetails(request, phone):
 
    try:
        tenant = Tenent.objects.filter(phone=phone).first()
 
        if not tenant:
            return Response(
                {"error": "Tenant not found"},
                status=status.HTTP_404_NOT_FOUND
            )
 
        # =========================================
        # PROFILE IMAGE
        # =========================================
        image_url = None
 
        if getattr(tenant, 'identityImage', None):
            image_url = request.build_absolute_uri(
                tenant.identityImage.url
            )
 
        # =========================================
        # PROPERTY DETAILS
        # =========================================
        property_name = "N/A"
        property_type = "N/A"
        location = "N/A"
        property_image = None
 
        if tenant.owner and not tenant.is_vacant:
            # Try to get active property from completed JoinRequest first
            jr = JoinRequest.objects.filter(tenant=tenant, status='completed').order_by('-created_at').first()
            
            # Find the specific property based on JoinRequest property name
            property_found = False
            if jr and jr.property_name:
                # Search Hostel
                hostel = StayHostelDetails.objects.filter(owner=tenant.owner, hostelName__iexact=jr.property_name.strip()).first()
                if hostel:
                    property_name = hostel.hostelName
                    property_type = hostel.stayType
                    location = hostel.location
                    if hostel.cover_image:
                        property_image = request.build_absolute_uri(hostel.cover_image.url)
                    property_found = True
                else:
                    # Search Apartment
                    apt = ApartmentStayDetails.objects.filter(owner=tenant.owner, apartmentName__iexact=jr.property_name.strip()).first()
                    if apt:
                        property_name = apt.apartmentName
                        property_type = apt.stayType
                        location = apt.location
                        if apt.cover_image:
                            property_image = request.build_absolute_uri(apt.cover_image.url)
                        property_found = True
                    else:
                        # Search Commercial
                        comm = CommericialDetails.objects.filter(owner=tenant.owner, commercialName__iexact=jr.property_name.strip()).first()
                        if comm:
                            property_name = comm.commercialName
                            property_type = comm.stayType
                            location = comm.location
                            if comm.cover_image:
                                property_image = request.build_absolute_uri(comm.cover_image.url)
                            property_found = True

            if not property_found:
                # Fallback to owner's first property if no matching completed JoinRequest found
                hostel = StayHostelDetails.objects.filter(
                    owner=tenant.owner
                ).first()
      
                if hostel:
                    property_name = hostel.hostelName
                    property_type = hostel.stayType
                    location = hostel.location
                    if hostel.cover_image:
                        property_image = request.build_absolute_uri(hostel.cover_image.url)
      
                else:
                    # APARTMENT
                    apartment = ApartmentStayDetails.objects.filter(
                        owner=tenant.owner
                    ).first()
      
                    if apartment:
                        property_name = apartment.apartmentName
                        property_type = apartment.stayType
                        location = apartment.location
                        if apartment.cover_image:
                            property_image = request.build_absolute_uri(apartment.cover_image.url)
      
                    else:
                        # COMMERCIAL
                        commercial = CommericialDetails.objects.filter(
                            owner=tenant.owner
                        ).first()
      
                        if commercial:
                            property_name = commercial.commercialName
                            property_type = commercial.stayType
                            location = commercial.location
                            if commercial.cover_image:
                                property_image = request.build_absolute_uri(commercial.cover_image.url)
 
        # =========================================
        # ROOM / FLOOR DETAILS
        # =========================================
        # =========================================
        # ROOM / FLOOR DETAILS
        # =========================================
        room_no = "N/A"
        floor_no = "N/A"
        check_in = "N/A"
        check_out = "N/A"
        rent = "N/A"
 
        # HOSTEL TENANT
        hostel_bed = TenantBeds.objects.filter(
            phone__iexact=tenant.phone
        ).first()
  
        if hostel_bed:
            room_no = hostel_bed.roomno
            floor_no = hostel_bed.floor
            check_in = str(hostel_bed.checkIn) if hostel_bed.checkIn else "N/A"
            check_out = str(hostel_bed.checkOut) if hostel_bed.checkOut else "N/A"
            rent = str(hostel_bed.rent)
  
        else:
            # APARTMENT TENANT
            apt_bed = ApartmentTenantBeds.objects.filter(
                phone__iexact=tenant.phone
            ).first()
  
            if apt_bed:
                room_no = apt_bed.flatno
                floor_no = apt_bed.floor
                check_in = str(apt_bed.checkIn) if apt_bed.checkIn else "N/A"
                check_out = str(apt_bed.checkOut) if apt_bed.checkOut else "N/A"
                rent = str(apt_bed.rent)
  
            else:
                # COMMERCIAL TENANT
                comm_bed = CommercialTenantBeds.objects.filter(
                    phone__iexact=tenant.phone
                ).first()
  
                if comm_bed:
                    room_no = comm_bed.sectionNo
                    floor_no = comm_bed.floor
                    check_in = str(comm_bed.checkIn) if comm_bed.checkIn else "N/A"
                    check_out = str(comm_bed.checkOut) if comm_bed.checkOut else "N/A"
                    rent = str(comm_bed.rent)
        
        # Fallback to completed JoinRequest allotment room/flat/section info if not formally registered in beds table
        if room_no == "N/A":
            jr = JoinRequest.objects.filter(tenant=tenant, status='completed').order_by('-created_at').first()
            if jr:
                room_no = jr.sharing or jr.flat or jr.section or "N/A"
                floor_no = "1"
                check_in = str(jr.created_at.date()) if jr.created_at else "N/A"

        aadhar_back_url = None
        payment_screenshot_url = None
        selfie_url = None

        if getattr(tenant, 'aadhar_back_image', None):
            aadhar_back_url = request.build_absolute_uri(tenant.aadhar_back_image.url)
        if getattr(tenant, 'payment_screenshot', None):
            payment_screenshot_url = request.build_absolute_uri(tenant.payment_screenshot.url)
        if getattr(tenant, 'selfie', None):
            selfie_url = request.build_absolute_uri(tenant.selfie.url)
 
        # =========================================
        # RESPONSE
        # =========================================
        data = {
            "id": tenant.id,
            "name": tenant.name,
            "phone": tenant.phone,
            "gender": getattr(tenant, "gender", "N/A"),
            "identityType": getattr(tenant, "identityType", "N/A"),
            "identityImage": image_url,
            "aadhar_id": getattr(tenant, "aadhar_id", "N/A"),
            "aadhar_image": image_url,
            "aadhar_back_image": aadhar_back_url,
            "payment_screenshot": payment_screenshot_url,
            "selfie": selfie_url,
 
            # PROPERTY
            "property_name": property_name,
            "property_type": property_type,
            "location": location,
            "property_image": property_image,
 
            # ROOM
            "room_number": room_no,
            "floor_number": floor_no,
            "check_in": check_in,
            "check_out": check_out,
            "rent": rent,
 
            "status": "Occupied" if (not tenant.is_vacant and tenant.aadhar_id and tenant.aadhar_image) else "Vacated",
        }
 
        return Response(data, status=status.HTTP_200_OK)
 
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response(
            {"error": str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )



@api_view(['PUT'])
@jwt_required()
def tenant_profile_update(request, phone):
    try:
        tenant = Tenent.objects.get(phone=phone)
 
        tenant.name = request.data.get('name', tenant.name)
        tenant.phone = request.data.get('phone', tenant.phone)
 
        tenant.save()
 
        return Response({
            "message": "Profile updated successfully"
        }, status=status.HTTP_200_OK)
 
    except Tenent.DoesNotExist:
        return Response({
            "error": "Tenant not found"
        }, status=status.HTTP_404_NOT_FOUND)
@api_view(['PUT'])
def owner_profile_update(request, phone):
    try:
        from django.db.models import Q
        # Robust lookup: support both owner_id and phone
        identifier = phone.strip()
        owner = Owners.objects.filter(Q(owner_id=identifier) | Q(phone__iexact=identifier)).first()
       
        if not owner:
            return Response({
                "message": f"Owner with ID/Phone {identifier} not found",
                "error": "Owner not found"
            }, status=status.HTTP_404_NOT_FOUND)
 
        # Update owner basic info
        owner.name = request.data.get('name', owner.name)
       
        # Handle both 'phone' and 'phoneNumber' from different frontend parts
        new_phone = request.data.get('phone') or request.data.get('phoneNumber')
        if new_phone and new_phone.strip():
            stripped_new_phone = new_phone.strip()
            if stripped_new_phone != owner.phone:
                # Check if this phone is already taken by ANOTHER owner
                existing = Owners.objects.filter(phone__iexact=stripped_new_phone).exclude(pk=owner.pk).first()
                if existing:
                    return Response({
                        "message": "This phone number is already registered with another account.",
                        "error": "Phone already exists"
                    }, status=status.HTTP_400_BAD_REQUEST)
                owner.phone = stripped_new_phone
       
        if 'owner_img_field' in request.FILES:
            owner.owner_img_field = request.FILES['owner_img_field']
 
        owner.save()
 
        # Handle Bank/UPI Details
        bank = BankDetails.objects.filter(owner=owner).first()
        if not bank:
            bank = BankDetails.objects.create(owner=owner)
       
        upi_id = request.data.get('upiId')
        if upi_id:
            bank.upi_id = upi_id.strip()
           
        if 'qrCode' in request.FILES:
            bank.qr_code = request.FILES['qrCode']
        elif 'qr_code' in request.FILES:
            bank.qr_code = request.FILES['qr_code']
           
        bank.save()
 
        return Response({
            "message": "Profile and payment details updated successfully",
            "upiId": bank.upi_id,
            "phoneNumber": owner.phone,
            "qrCode": request.build_absolute_uri(bank.qr_code.url) if hasattr(bank, 'qr_code') and getattr(bank, 'qr_code') else None
        }, status=status.HTTP_200_OK)
 
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response({
            "message": f"Update failed: {str(e)}",
            "error": str(e)
        }, status=status.HTTP_400_BAD_REQUEST)

# @api_view(['POST'])
# def update_status(request):
#     tenant_id = request.data.get("id")
#     status_value = request.data.get("status")
 
#     tenant = Tenent.objects.get(id=tenant_id)
#     tenant.status = status_value
#     tenant.save()
 
#     return Response({"message": "Status updated"})
@api_view(['POST'])
@jwt_required()
def update_status(request):
    tenant_phone = request.data.get("tenant_phone")
    owner_phone = request.data.get("owner_phone")
    status_value = request.data.get("status")

    try:
        tenant = Tenent.objects.get(
            tenant_phone=tenant_phone,
            owner_phone=owner_phone
        )
        tenant.status = status_value
        tenant.save()

        return Response({"message": "Status updated"})
    except Tenent.DoesNotExist:
        return Response({"error": "Request not found"}, status=404)
    
@api_view(['GET'])
@jwt_required()
def tenant_by_phone(request, phone):
    try:
        tenant = Tenent.objects.get(phone=phone)
 
        image_url = None
 
        if tenant.identityImage:
            image_url = request.build_absolute_uri(
                tenant.identityImage.url
            )
 
        data = {
            "id": tenant.id,
            "name": tenant.name,
            "phone": tenant.phone,
            "gender": tenant.gender,
            "identityType": tenant.identityType,
            "identityImage": image_url,
        }
 
        return Response(data, status=status.HTTP_200_OK)
 
    except Tenent.DoesNotExist:
        return Response(
            {"error": "Tenant not found"},
            status=status.HTTP_404_NOT_FOUND
        )
 
    except Exception as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )

from django.db.models import Q
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
import time
from django.db.models import Q
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from dateutil.relativedelta import relativedelta
from datetime import datetime
import time

from django.db.models import Q
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from dateutil.relativedelta import relativedelta
import time

@api_view(['GET'])
@jwt_required()
def get_tenant_payment_details(request, phone):
 
    try:
 
        # =========================================
        # TENANT
        # =========================================
        tenant_phone = phone.strip().lower()
 
        tenant = Tenent.objects.get(
            phone__iexact=tenant_phone
        )
 
        tenant_phone = (tenant.phone or "").strip()
 
        # =========================================
        # ACCEPTED JOIN REQUEST / DIRECT ASSIGNMENT
        # =========================================
        request_obj = JoinRequest.objects.filter(
            tenant=tenant,
            status='accepted'
        ).order_by('-created_at').first()
 
        owner = None
        if request_obj:
            try:
                owner = request_obj.owner
            except Exception:
                pass
                
        # Fallback to direct owner assignment if added manually
        if not owner and tenant.owner:
            owner = tenant.owner

        if not owner:
            return Response(
                {
                    "error": "No approved property found. You are not assigned to any property yet."
                },
                status=status.HTTP_404_NOT_FOUND
            )
 
        # =========================================
        # BANK DETAILS
        # =========================================
        bank_details = BankDetails.objects.filter(
            owner=owner
        ).first()
 
        if not bank_details:
            print("Owner bank details not found, using owner phone as fallback.")
 
        # =========================================
        # DEFAULT VALUES
        # =========================================
        rent = 0
        due_date = None
        checkin_date = None
 
        # =========================================
        # PROPERTY TYPE
        # =========================================
        p_type = ""
        if request_obj and request_obj.property_type:
            p_type = request_obj.property_type.lower()
 
        all_tables = [
            TenantBeds,
            ApartmentTenantBeds,
            CommercialTenantBeds
        ]
 
        primary_table = None
 
        if p_type == 'hostel':
 
            primary_table = TenantBeds
 
        elif p_type == 'apartment':
 
            primary_table = ApartmentTenantBeds
 
        elif p_type == 'commercial':
 
            primary_table = CommercialTenantBeds
 
        # =========================================
        # FIND TENANT RECORD
        # =========================================
        record = None
 
        # PRIMARY TABLE SEARCH
        if primary_table:
 
            record = primary_table.objects.filter(
                (
                    Q(phone__iexact=tenant_phone) |
                    Q(phone__iexact=tenant_phone)
                ),
                owner_phone=owner.owner_id
            ).order_by('-id').first()
 
        # FALLBACK SEARCH
        if not record:
 
            for table in all_tables:
 
                record = table.objects.filter(
                    (
                        Q(phone__iexact=tenant_phone) |
                        Q(phone__iexact=tenant_phone)
                    ),
                    owner_phone=owner.owner_id
                ).order_by('-id').first()
 
                if record:
                    break
 
        # =========================================
        # RECORD FOUND
        # =========================================
        if record:
 
            # RENT
            rent = float(record.rent or 0)
 
            print("TENANT RECORD FOUND")
            print("CHECKIN:", record.checkIn)
 
            # =========================================
            # CHECKIN DATE
            # =========================================
            if record.checkIn:
 
                try:
 
                    # DateField already returns date object
                    checkin_date = record.checkIn
 
                    print("CHECKIN DATE:", checkin_date)
 
                    # INITIAL DUE DATE IS CHECKIN DATE
                    due_date = checkin_date
 
                    print("DUE DATE:", due_date)
 
                except Exception as e:
 
                    print(
                        "DUE DATE ERROR:",
                        str(e)
                    )
 
                    due_date = None
 
        else:
 
            print("NO TENANT RECORD FOUND")
 
        # =========================================
        # RENT FALLBACK
        # =========================================
        if rent == 0:
            # 1. Try to find a previous successful payment for this specific property
            prop_name = request_obj.property_name if request_obj else ""
            prev_p = Payment.objects.filter(
                owner_phone=owner.owner_id,
                property_name=prop_name,
                status='SUCCESS'
            ).order_by('-id').first()
           
            if prev_p:
                rent = float(prev_p.amount or 0)
            else:
                # 2. Heuristic: Find other tenants who joined this same property
                # and see what their rent is in the allotment tables.
                other_requests = JoinRequest.objects.filter(
                    owner=owner,
                    property_name=prop_name,
                    status='accepted'
                ).exclude(tenant=tenant)
               
                found_rent = 0
                for req in other_requests:
                    try:
                        if not req.tenant or not req.tenant.phone:
                            continue
                        other_tenant_phone = req.tenant.phone
                    except Exception:
                        continue
 
                    # Check each bed table for this other tenant
                    for table in [TenantBeds, ApartmentTenantBeds, CommercialTenantBeds]:
                        other_record = table.objects.filter(phone__iexact=other_tenant_phone, owner_phone__iexact=owner.owner_id).first()
                        if other_record and other_record.rent:
                            found_rent = float(other_record.rent)
                            break
                    if found_rent > 0:
                        break
               
                if found_rent > 0:
                    rent = found_rent
                else:
                    # 3. Last Resort: Check any payment record (even pending) for this property
                    any_p = Payment.objects.filter(
                        owner_phone=owner.owner_id,
                        property_name=prop_name
                    ).order_by('-id').first()
                    if any_p:
                        rent = float(any_p.amount or 0)
                    else:
                        # If still 0, maybe use a default or log it
                        print(f"   [BACKEND] No rent found for property: {prop_name}")
 
        # =========================================
        # DATE FALLBACK (FROM JOIN REQUEST)
        # =========================================
        if not checkin_date and request_obj and request_obj.check_in:
            try:
                # Handle both YYYY-MM-DD and other formats if needed
                if '-' in request_obj.check_in:
                    checkin_date = datetime.strptime(request_obj.check_in[:10], "%Y-%m-%d").date()
                else:
                    # Fallback or other formats
                    pass
            except Exception as e:
                print(f"Check-in parse error: {e}")
 
        if not due_date and checkin_date:
            try:
                due_date = checkin_date
            except:
                pass
 
        # =========================================
        # TRANSACTION REF
        # =========================================
        txn_ref = (
            f"OTMS{int(time.time()*1000)}"
        )
 
        # =========================================
        # PAYMENT STATUS CALCULATION
        # =========================================
        payment_status = 'Pending'
        current_month = timezone.now().month
        current_year = timezone.now().year
 
        # 1. Check for SUCCESSFUL payment this month
        has_paid = Payment.objects.filter(
            tenant_phone__iexact=tenant_phone,
            owner_phone__iexact=owner.owner_id,
            status='SUCCESS',
            created_at__year=current_year,
            created_at__month=current_month
        ).exists()
 
        if has_paid:
            payment_status = 'Paid'
            # If they already paid, the next due date should be next month
            if due_date and due_date.month == current_month and due_date.year == current_year:
                due_date = due_date + relativedelta(months=1)
        else:
            # 2. Check for PENDING payment this month (Verifying)
            has_pending = Payment.objects.filter(
                tenant_phone__iexact=tenant_phone,
                owner_phone__iexact=owner.owner_id,
                status='PENDING',
                created_at__year=current_year,
                created_at__month=current_month
            ).exists()
           
            if has_pending:
                payment_status = 'Verifying'
            elif due_date:
                # If no payment record, status is based on due date
                today = timezone.now().date()
                if due_date < today:
                    payment_status = 'Overdue'
                elif due_date == today:
                    payment_status = 'Due Today'
                else:
                    payment_status = 'Pending'
 
        # =========================================
        # RESPONSE
        # =========================================
        last_p = Payment.objects.filter(
            tenant_phone__iexact=tenant_phone,
            owner_phone__iexact=owner.owner_id
        ).order_by('-created_at').first()
 
        owner_issue = Issue.objects.filter(
            tenant=tenant,
            owner=owner,
            status='Pending'
        ).order_by('-id').first()
 
        qr_code_url = None
        if bank_details and hasattr(bank_details, 'qr_code') and bank_details.qr_code:
            try:
                qr_code_url = request.build_absolute_uri(bank_details.qr_code.url)
            except Exception as qr_err:
                print("QR code URL generation failed or file missing:", qr_err)
 
        payment_reminder = Notification.objects.filter(
            recipient_phone__iexact=tenant_phone,
            type__in=['REMINDER', 'PAYMENT_REQUEST']
        ).order_by('-created_at').first()

        response_data = {
            "ownerName":
                owner.name if owner.name
                else "Owner",
 
            "ownerPhone":
                owner.owner_id if owner.owner_id else owner.phone,
 
            "tenantName":
                tenant.name if tenant.name
                else "Tenant",
 
            "bankName":
                bank_details.bankName
                if bank_details and bank_details.bankName
                else "N/A",
 
            "upiId":
                bank_details.upi_id
                if bank_details and bank_details.upi_id
                else owner.phone,
               
            "ownerPhone": owner.phone,
           
            "qrCode": qr_code_url,
 
            "propertyName":
                request_obj.property_name
                if request_obj and request_obj.property_name
                else "Property",
 
            "propertyType":
                request_obj.property_type
                if request_obj and request_obj.property_type
                else "hostel",
 
            "rent": rent,
 
            "checkIn":
                checkin_date.strftime("%Y-%m-%d")
                if checkin_date else None,
 
            "dueDate":
                due_date.strftime("%Y-%m-%d")
                if due_date else None,
 
            "txnRef": txn_ref,
 
            "status": payment_status,
 
            "lastPaymentStatus": last_p.status if last_p else None,
 
            "lastPaymentRef": last_p.txn_ref if last_p else None
 
        }
 
        if payment_reminder:
            response_data['paymentReminder'] = {
                "id": payment_reminder.id,
                "title": payment_reminder.title,
                "message": payment_reminder.message,
                "type": payment_reminder.type,
                "created_at": payment_reminder.created_at
            }
        return Response(response_data)
 
    except Tenent.DoesNotExist:
 
        return Response(
            {
                "error":
                f"Tenant with phone {tenant_phone} not found"
            },
            status=status.HTTP_404_NOT_FOUND
        )
 
    except Exception as e:
 
        print("PAYMENT DETAILS ERROR:", str(e))
        import traceback
        traceback.print_exc()
 
        return Response(
            {
                "error":
                f"Server Error: {str(e)}"
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
   
    

@api_view(['GET'])
@jwt_required()
def owner_admin_list(request):
    owners = Owners.objects.all().order_by('-owner_id')
 
    data = []
    for owner in owners:
        # Determine property type
        p_type = "N/A"
        if StayHostelDetails.objects.filter(owner=owner).exists():
            p_type = "Hostel"
        elif ApartmentStayDetails.objects.filter(owner=owner).exists():
            p_type = "Apartment"
        elif CommericialDetails.objects.filter(owner=owner).exists():
            p_type = "Commercial"

        data.append({
            "id": owner.pk,
            "owner_name": owner.name,
            "phone": owner.phone,
            "property_type": p_type,
            "created_at": owner.created_at.isoformat() if owner.created_at else None,
            "status": owner.status
        })
 
    return Response(
        {
            "count": len(data),
            "data": data
        },
        status=status.HTTP_200_OK
    )
 
 
 
 
@api_view(['GET'])
@jwt_required()
def get_owner_full_details(request, phone):
    try:
        owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone=phone)).order_by('-created_at').first()
        if not owner:
            raise Owners.DoesNotExist
    except Owners.DoesNotExist:
        return Response(
            {"error": "Owner not found"},
            status=status.HTTP_404_NOT_FOUND
        )
 
    # ================= FILE URL BUILDER =================
    def build_file_url(file_field):
        if file_field and hasattr(file_field, 'url'):
            return request.build_absolute_uri(file_field.url)
        return None
 
    # ================= GALLERY URL BUILDER =================
    def build_gallery_urls(gallery_list):
        if not gallery_list:
            return []
 
        urls = []
 
        for img in gallery_list:
            try:
                urls.append(
                    request.build_absolute_uri(
                        settings.MEDIA_URL + str(img)
                    )
                )
            except Exception:
                pass
 
        return urls
 
    # ================= OWNER BASIC DETAILS =================
    bank = BankDetails.objects.filter(owner=owner).first()
   
    step1 = {
        "id": owner.pk,
        "name": owner.name if owner.name else "",
        "phone": owner.phone if owner.phone else "",
        "status": owner.status if owner.status else "",
        "owner_img_field": build_file_url(
            getattr(owner, 'owner_img_field', None)
        ),
        "upiId": bank.upi_id if bank and bank.upi_id else "",
        "phoneNumber": owner.phone if owner.phone else "",
        "qrCode": build_file_url(bank.qr_code) if bank and hasattr(bank, 'qr_code') else None,
    }
 
    property_type = None
    property_data = None
    building_layout = []
 
    # ======================================================
    # HOSTEL
    # ======================================================
    hostel = StayHostelDetails.objects.filter(owner=owner).first()
 
    if hostel:
        property_type = "hostel"
 
        property_data = {
            "id": hostel.id,
            "stayType": hostel.stayType,
            "property_name": hostel.hostelName,
            "location": hostel.location,
            "hostelType": hostel.hostelType,
            "facilities": hostel.facilities if hostel.facilities else [],
            "gallery_images": build_gallery_urls(
                hostel.gallery_images
            ),
        }
 
        floors = HostelFloorRoom.objects.filter(
            hostel=hostel
        ).order_by("floor", "roomNo")
 
        floor_map = {}
 
        for room in floors:
 
            if room.floor not in floor_map:
                floor_map[room.floor] = []
 
            floor_map[room.floor].append({
                "roomNo": room.roomNo,
                "beds": room.sharing
            })
 
        for floor_no, rooms in floor_map.items():
            building_layout.append({
                "floorNo": floor_no,
                "rooms": rooms
            })
 
    # ======================================================
    # APARTMENT
    # ======================================================
    apartment = ApartmentStayDetails.objects.filter(
        owner=owner
    ).first()
 
    if apartment and not property_type:
 
        property_type = "apartment"
 
        property_data = {
            "id": apartment.id,
            "stayType": apartment.stayType,
            "property_name": apartment.apartmentName,
            "location": apartment.location,
            "tenantType": apartment.tenantType,
            "facilities": apartment.facilities if apartment.facilities else [],
            "gallery_images": build_gallery_urls(
                apartment.gallery_images
            ),
        }
 
        floors = ApartmentFloorUnit.objects.filter(
            apartment=apartment
        ).order_by("floor", "flatNo")
 
        floor_map = {}
 
        for flat in floors:
 
            if flat.floor not in floor_map:
                floor_map[flat.floor] = []
 
            floor_map[flat.floor].append({
                "flatNo": flat.flatNo,
                "bhk": flat.bhk
            })
 
        for floor_no, flats in floor_map.items():
            building_layout.append({
                "floorNo": floor_no,
                "flats": flats
            })
 
    # ======================================================
    # COMMERCIAL
    # ======================================================
    commercial = CommericialDetails.objects.filter(
        owner=owner
    ).first()
 
    if commercial and not property_type:
 
        property_type = "commercial"
 
        property_data = {
            "id": commercial.id,
            "stayType": commercial.stayType,
            "property_name": commercial.commercialName,
            "location": commercial.location,
            "usage": commercial.usage,
            "facilities": commercial.facilities if commercial.facilities else [],
            "gallery_images": build_gallery_urls(
                commercial.gallery_images
            ),
        }
 
        floors = CommercialFloor.objects.filter(
            commercial_property=commercial
        ).order_by("floorNo", "sectionNo")
 
        floor_map = {}
 
        for section in floors:
 
            if section.floorNo not in floor_map:
                floor_map[section.floorNo] = []
 
            floor_map[section.floorNo].append({
                "sectionNo": section.sectionNo,
                "area_sqft": section.area_sqft
            })
 
        for floor_no, sections in floor_map.items():
            building_layout.append({
                "floorNo": floor_no,
                "sections": sections
            })
 
    # ======================================================
    # NO PROPERTY
    # ======================================================
    if not property_type:
        return Response(
            {"error": "No property found"},
            status=status.HTTP_404_NOT_FOUND
        )
 
    # ======================================================
    # FINAL RESPONSE
    # ======================================================
    response_data = {
        "message": "Owner full details fetched successfully",
 
        "property_type": property_type,
 
        "step1": step1,
 
        "step2": {
            "property_details": property_data
        },
 
        "step3": {
            "building_layout": building_layout
        }
    }
 
    return Response(response_data, status=status.HTTP_200_OK)
 
 
 

@api_view(['PATCH'])
@jwt_required()
def update_owner_status(request, phone):
    try:
        owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone=phone)).order_by('-created_at').first()
        if not owner:
            raise Owners.DoesNotExist
    except Owners.DoesNotExist:
        return Response({"error": "Owner not found"}, status=404)
 
    new_status = request.data.get("status")
    suspension_reason = request.data.get("suspension_reason", "")
 
    if not new_status:
        return Response({"error": "Status required"}, status=400)
 
    allowed_statuses = ["active", "pending", "suspend"]
 
    if new_status not in allowed_statuses:
        return Response({
            "error": "Invalid status",
            "allowed": allowed_statuses
        }, status=400)
 
    owner.status = new_status
    if suspension_reason:
        owner.suspension_reason = suspension_reason
    owner.save()
 
    # Create Notification in DB
    notification_msg = f"Your account has been {owner.status} by admin."
    if new_status == 'suspend' and suspension_reason:
        notification_msg += f" Reason: {suspension_reason}"
 
    Notification.objects.create(
        recipient_phone=owner.owner_id,
        title="Account Status Updated",
        message=notification_msg,
        type="ISSUE"
    )
 
    # WebSocket: Notify Owner of status change
    try:
        channel_layer = get_channel_layer()
        sanitized_phone = phone.replace("@", "_").replace(".", "_")
        async_to_sync(channel_layer.group_send)(
            f"owner_status_{sanitized_phone}",
            {
                "type": "status_update",
                "content": {
                    "type": "account_status",
                    "status": owner.status,
                    "message": notification_msg,
                    "reason": suspension_reason
                }
            }
        )
    except Exception as e:
        print(f"WS Status Notification Error: {e}")
 
    # WebSocket: Notify Public/Tenants to refresh property list if status changed
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "public_updates",
            {
                "type": "send_notification",
                "content": {
                    "type": "property_update",
                    "message": "Property list updated"
                }
            }
        )
    except Exception as e:
        print(f"WS Public Update Error: {e}")
 
    return Response({
        "message": "Status updated",
        "phone": owner.phone,
        "status": owner.status
    }) 
 
 
 
@api_view(['GET'])
def check_owner_status(request, phone):
    try:
        owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone=phone)).order_by('-created_at').first()
        if not owner:
            raise Owners.DoesNotExist
    except Owners.DoesNotExist:
        return Response({"error": "Owner not found"}, status=404)
 
    remaining_time = (owner.created_at + timedelta(days=2)) - now()
    remaining_seconds = int(remaining_time.total_seconds())
 
    if remaining_seconds < 0:
        remaining_seconds = 0
 
    response_data = {
        "status": owner.status,
        "time_left_seconds": remaining_seconds,
        "reason": owner.suspension_reason or ""
    }
    if owner.status == "active":
        response_data["token"] = generate_jwt_token(owner)
        response_data["owner_id"] = owner.owner_id
        response_data["owner_name"] = owner.name
        response_data["owner_phone"] = owner.phone
    return Response(response_data)
 
 
@api_view(['POST'])
@jwt_required()
def update_request_status(request):
    request_id = request.data.get("id")
    status_value = request.data.get("status")
 
    try:
        req = JoinRequest.objects.get(id=request_id)
        req.status = status_value
        req.save()
       
        # Broadcast to Tenant if accepted or rejected
        if status_value in ['accepted', 'rejected', 'allotted']:
            from asgiref.sync import async_to_sync
            from channels.layers import get_channel_layer
           
            sanitized_phone = req.tenant.phone.replace("+", "").replace("@", "_").replace(".", "_")
            message = f"Your request for {req.property_name} has been {status_value}."
           
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"user_notifications_{sanitized_phone}",
                {
                    "type": "send_notification",
                    "content": {
                        "type": "status_update",
                        "message": message,
                        "status": status_value
                    }
                }
            )
           
        return Response({"message": "Status updated"})
    except JoinRequest.DoesNotExist:
        return Response({"error": "Request not found"}, status=404)

 
 
 
# @api_view(['POST'])
# def send_join_request(request):
#     tenant_phone = request.data.get("tenant_phone")
#     owner_phone = request.data.get("owner_phone")
#     property_name = request.data.get("property_name")
 
#     try:
#         tenant = Tenent.objects.get(phone=tenant_phone)
#         owner = Owners.objects.get(phone=owner_phone)
#     except:
#         return Response({"error": "User not found"}, status=400)
 
#     JoinRequest.objects.create(
#         tenant=tenant,
#         owner=owner,
#         property_name=property_name,
#         status="pending"
#     )
#     print("REQUEST DATA:", request.data)
#     print("TENANT:", tenant_phone)
#     print("OWNER:", owner_phone)
 
#     return Response({"message": "Request sent successfully"})

from rest_framework.decorators import api_view, parser_classes
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from asgiref.sync import async_to_sync


@api_view(['POST'])
@jwt_required()
def send_join_request(request):
 
    print("--- RAW REQUEST DATA ---")
    print(dict(request.data))
    
    tenant_phone = request.data.get("tenant_phone", "").strip()
    owner_id = request.data.get("owner_id", "").strip()
    owner_phone = request.data.get("owner_phone", "").strip()
    property_name = request.data.get("property_name", "").strip()
    
    print(f"Parsed -> Tenant: '{tenant_phone}', OwnerID: '{owner_id}', OwnerPhone: '{owner_phone}', Prop: '{property_name}'")
    
    lookup_id = owner_id if owner_id else owner_phone
 
    property_type = request.data.get(
        "property_type"
    )
 
    check_in = request.data.get(
        "check_in"
    )
 
    check_out = request.data.get(
        "check_out"
    )
 
    sharing = request.data.get(
        "sharing"
    )
 
    flat = request.data.get(
        "flat"
    )
 
    section = request.data.get(
        "section"
    )
 
    print(
        f"SENDING JOIN REQUEST: "
        f"Tenant({tenant_phone}) "
        f"-> Owner({lookup_id}) "
        f"for {property_name}"
    )
 
    # ✅ VALIDATION
    if not tenant_phone or not lookup_id:
 
        return Response(
            {
                "error":
                "Missing phone fields"
            },
            status=400
        )
 
    # ✅ GET TENANT & OWNER
    try:
 
        tenant = Tenent.objects.filter(
            phone=tenant_phone
        ).first()
        if not tenant:
            raise Tenent.DoesNotExist

        if not tenant.is_vacant:
            return Response(
                {"error": "You already have an active stay. You must vacate your current property before booking another one."},
                status=400
            )
 
        owner = Owners.objects.filter(Q(owner_id=lookup_id) | Q(phone=lookup_id)).order_by('-created_at').first()
        if not owner:
            raise Owners.DoesNotExist
 
    except Tenent.DoesNotExist:
 
        return Response(
            {
                "error":
                "Tenant not found"
            },
            status=400
        )
 
    except Owners.DoesNotExist:
 
        return Response(
            {
                "error":
                "Owner not found"
            },
            status=400
        )
 
    # ✅ DUPLICATE CHECK
    existing = JoinRequest.objects.filter(
        tenant=tenant,
        property_name__iexact=property_name,
        status__in=[
            'pending',
            'accepted',
            'allotted'
        ]
    ).first()
 
    if existing:
 
        return Response(
            {
                "message":
                "You already have an active request for this property"
            },
            status=200
        )
 
    # ✅ CREATE REQUEST
    JoinRequest.objects.create(
        tenant=tenant,
        owner=owner,
 
        property_name=property_name,
        property_type=property_type,
 
        check_in=check_in,
        check_out=check_out,
 
        sharing=sharing,
        flat=flat,
        section=section,
 
        status="pending"
    )
 
    # ✅ SAVE OWNER
    tenant.owner = owner
    tenant.save()
 
    # ✅ WEBSOCKET
    try:
 
        channel_layer = get_channel_layer()
 
        sanitized_phone = owner.owner_id if owner.owner_id else (owner.phone.replace("+", "") if owner else "")
 
        for group in [
            f"owner_status_{sanitized_phone}",
            f"user_notifications_{sanitized_phone}"
        ]:
 
            async_to_sync(
                channel_layer.group_send
            )(
                group,
                {
                    "type":
                    "status_update"
                    if "owner_status" in group
                    else "send_notification",
 
                    "content": {
                        "type":
                        "incoming_request",
 
                        "message":
                        f"New join request from {tenant.name}",
 
                        "id":
                        tenant.id,
 
                        "status":
                        "pending"
                    }
                }
            )
 
    except Exception as e:
 
        print(
            f"Owner WS Notification Error: {e}"
        )
 
    return Response(
        {
            "message":
            "Request sent successfully"
        }
    )
 

@api_view(['GET'])
@jwt_required()
def owner_requests(request, phone):
    try:
        owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone=phone)).order_by('-created_at').first()
        if not owner:
            raise Owners.DoesNotExist
    except Owners.DoesNotExist:
        return Response({"error": "Owner not found"}, status=404)

    requests = JoinRequest.objects.filter(owner=owner).order_by('-created_at')

    data = []

    for r in requests:
        data.append({
            "id": r.id,

            # tenant details
            "name": r.tenant.name,
            "phone": r.tenant.phone,

            # request details
            "status": r.status,
            "propertyName": r.property_name,
            "propertyType": r.property_type,
            "checkIn": r.check_in,
            "checkOut": r.check_out,
            "sharing": r.sharing,
            "flat": r.flat,
            "section": r.section,
            "created_at": r.created_at,

            
        })

    return Response(data)


@api_view(['GET'])
@jwt_required()
def tenant_notifications(request, identifier):
    """
    Returns join request notifications for a tenant identified by email or phone.
    """
    # Determine tenant by email or phone
    try: 
        identifier = identifier.strip()
        tenant = Tenent.objects.filter(Q(phone__iexact=identifier) | Q(name__iexact=identifier)).first()
        if not tenant:
            return Response({"error": "Tenant not found"}, status=404)
    except Exception as e:
        return Response({"error": "Tenant not found"}, status=404)
 
    # JOIN REQUESTS ONLY
    requests = JoinRequest.objects.filter(
        tenant=tenant
    ).order_by('-created_at')
 
    data = []
 
    # JOIN REQUEST NOTIFICATIONS
    for r in requests:
        status_val = r.status
        if tenant.is_vacant or tenant.owner != r.owner:
            if status_val in ['completed', 'accepted', 'allotted', 'joined', 'active']:
                status_val = 'withdrawn'
        data.append({
            "id": f"req_{r.id}",
            "type": "JOIN_REQUEST",
            "propertyName": r.property_name,
            "status": status_val,
            "owner_phone": r.owner.phone if r.owner else None,
            "owner_id": r.owner.owner_id if r.owner and r.owner.owner_id else None,
            "created_at": r.created_at,
        })
 
    # SORT
    data.sort(
        key=lambda x: x['created_at'],
        reverse=True
    )
 
    return Response(data)
 
 
 
 
@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def create_issue(request):
    data = request.data
    files = request.FILES
    try:
        tenant_id = data.get("tenant_id")
        phone = data.get("phone") or data.get("phone_number")  # Legacy support for old frontend that sends phone instead of tenant_id
 
        tenant = None
        if tenant_id:
            tenant = Tenent.objects.get(id=tenant_id)
        elif phone:
            # Note: phone parameter might contain phone number from old frontend code
            tenant = Tenent.objects.get(phone=phone)
       
        if not tenant:
            return Response({"error": "Tenant not found"}, status=404)
        if not tenant.owner:
            return Response(
                {"error": "Tenant not assigned to any owner"},
                status=400
            )
        owner = tenant.owner
        image = files.get("image")
        issue = Issue.objects.create(
            tenant=tenant,
            owner=owner,
            title=data.get("title"),
            description=data.get("description"),
            severity=data.get("severity", "Medium"),
            status="Pending",
            image=image
        )
 
        # Create Notification in DB
        notification = Notification.objects.create(
            recipient_phone=owner.owner_id,
            title="New Issue Raised",
            message=f"{tenant.name} has raised a new issue: {issue.title}",
            type="ISSUE",
            related_id=issue.id
        )
 
        # Send WebSocket notification to owner
        try:
            channel_layer = get_channel_layer()
            sanitized_phone = owner.phone.replace("@", "_").replace(".", "_")
           
            for group in [f"owner_status_{sanitized_phone}", f"user_notifications_{sanitized_phone}"]:
                async_to_sync(channel_layer.group_send)(
                    group,
                    {
                        "type": "status_update" if "owner_status" in group else "send_notification",
                        "content": {
                            "id": notification.id,
                            "type": "ISSUE",
                            "title": notification.title,
                            "message": notification.message,
                            "is_read": notification.is_read,
                            "created_at": notification.created_at.isoformat(),
                            "related_id": issue.id
                        }
                    }
                )
        except Exception as e:
            print(f"WS Issue Notification Error: {e}")
 
        return Response({"message": "Issue created successfully"}, status=201)
    except Tenent.DoesNotExist:
        return Response({"error": "Tenant not found"}, status=404)
    except Exception as e:
        print("Create Issue Error:", e)
        return Response({"error": str(e)}, status=400)



        
@api_view(['GET'])
@jwt_required()
def tenant_issues(request, identifier):
    try:
        tenant = Tenent.objects.filter(phone=identifier).first()
        if not tenant:
            return Response({"error": "Tenant not found"}, status=400)
 
        # Exclude notifications/reminders that were mistakenly saved as Issues
        issues = Issue.objects.filter(tenant=tenant).exclude(title__icontains='Reminder').order_by('-created_at')
        serializer = IssueSerializer(issues, many=True)
        return Response(serializer.data)
    except Exception as e:
        return Response({"error": str(e)}, status=500)


@api_view(['GET'])
@jwt_required()
def owner_issues(request, phone):
    try:
        owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone=phone)).order_by('-created_at').first()
        if not owner:
            raise Owners.DoesNotExist
    except Owners.DoesNotExist:
        return Response({"error": "Owner not found"}, status=404)
 
    # ✅ Only this owner's issues, exclude notifications/reminders
    issues = Issue.objects.filter(owner=owner).exclude(title__icontains='Reminder').order_by('-created_at')
 
    # Real-time search/filtering in backend
    search_query = request.query_params.get('search', '').strip()
    if search_query:
        issues = issues.filter(
            Q(title__icontains=search_query) |
            Q(description__icontains=search_query) |
            Q(tenant__name__icontains=search_query) |
            Q(tenant__phone__icontains=search_query)
        )
 
    data = []
    for i in issues:
        # Find property details for search optimization (optional enhancement)
        # For now including standard fields
        data.append({
            "id": i.id,
            "title": i.title,
            "description": i.description,
            "severity": i.severity,
            "status": i.status,
            "tenant_name": i.tenant.name if i.tenant else "Unknown",
            "tenant_phone": i.tenant.phone if i.tenant else "N/A",
            "owner_comment": i.owner_comment,
            "image": request.build_absolute_uri(i.image.url) if i.image else None,
            "date": i.created_at
        })
 
    return Response(data)


@api_view(['PATCH'])
@jwt_required()
def update_issue_status(request, issue_id):
    try:
        issue = Issue.objects.get(id=issue_id)
    except Issue.DoesNotExist:
        return Response({"error": "Issue not found"}, status=404)
 
    status_value = request.data.get("status")
 
    if status_value not in ["Pending", "In Progress", "Completed"]:
        return Response({"error": "Invalid status"}, status=400)
 
    issue.status = status_value
    issue.save()
 
    # Notify Tenant
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
       
        sanitized_phone = issue.tenant.phone.replace("+", "").replace("@", "_").replace(".", "_")
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"user_notifications_{sanitized_phone}",
            {
                "type": "send_notification",
                "content": {
                    "type": "ISSUE",
                    "message": f"Owner has updated your issue '{issue.title}' to {status_value}."
                }
            }
        )
    except Exception as e:
        print("WS Error Notify Tenant Issue Status:", e)
 
    return Response({"message": "Status updated"})
 
 
@api_view(['PATCH'])
@jwt_required()
def update_issue_comment(request, issue_id):
    try:
        issue = Issue.objects.get(id=issue_id)
    except Issue.DoesNotExist:
        return Response({"error": "Issue not found"}, status=404)
 
    print("DATA:", request.data)  #  MUST PRINT
 
    comment = request.data.get("owner_comment")
 
    if not comment:
        return Response({"error": "Comment required"}, status=400)
 
    issue.owner_comment = comment
    issue.save()
 
    # Notify Tenant
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
       
        sanitized_phone = issue.tenant.phone.replace("+", "").replace("@", "_").replace(".", "_")
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"user_notifications_{sanitized_phone}",
            {
                "type": "send_notification",
                "content": {
                    "type": "ISSUE",
                    "message": f"Owner commented on your issue '{issue.title}': {comment}"
                }
            }
        )
    except Exception as e:
        print("WS Error Notify Tenant Issue Comment:", e)
 
    return Response({
        "message": "Comment updated successfully",
        "owner_comment": issue.owner_comment
    }, status=200)
 
@api_view(['GET'])
@jwt_required()
def test_create_issue(request):
    return Response({"msg":"test ok"}, status=200)
 
@api_view(['DELETE'])
@jwt_required()
def delete_issue(request, issue_id):
    try:
        issue = Issue.objects.get(id=issue_id)
    except Issue.DoesNotExist:
        return Response({"error": "Issue not found"}, status=404)
 
    issue.delete()
    return Response({"message": "Issue deleted successfully"}, status=200)
 
@api_view(['PATCH'])
@jwt_required()
def update_issue(request, id):
    try:
        issue = Issue.objects.get(id=id)
    except Issue.DoesNotExist:
        return Response({"error": "Issue not found"}, status=404)
 
    data = request.data.copy()
 
    # ✅ handle image manually
    if 'image' in request.FILES:
        issue.image = request.FILES['image']
 
    serializer = IssueSerializer(issue, data=data, partial=True)
 
    if serializer.is_valid():
        serializer.save()
        return Response({"message": "Issue updated successfully"})
 
    return Response(serializer.errors, status=400)
 


from django.db.models import Q

@api_view(['GET'])
@jwt_required()
def check_request_status(request, tenant_phone, owner_phone, property_name):
    try:
        tenant = Tenent.objects.get(phone=tenant_phone.strip())
        owner = Owners.objects.filter(Q(owner_id=owner_phone.strip()) | Q(phone=owner_phone.strip())).order_by('-created_at').first()
        if not owner:
            raise Owners.DoesNotExist
 
        stripped_name = property_name.strip()
 
        join_req = JoinRequest.objects.filter(
            tenant=tenant,
            owner=owner
        ).filter(
            Q(property_name__iexact=stripped_name) |
            Q(property_name__icontains=stripped_name)
        ).order_by('-created_at').first()
 
        if join_req:
            status_val = join_req.status
            if tenant.is_vacant or tenant.owner != owner:
                if status_val in ['completed', 'accepted', 'allotted', 'joined', 'active']:
                    status_val = 'none'
            return Response({
                "status": status_val
            })
 
        return Response({
            "status": "none"
        })
 
    except Tenent.DoesNotExist:
        return Response({
            "status": "none",
            "error": "Tenant not found"
        })
 
    except Owners.DoesNotExist:
        return Response({
            "status": "none",
            "error": "Owner not found"
        })
 
    except Exception as e:
        return Response({
            "status": "none",
            "error": str(e)
        })

@api_view(['POST'])
@jwt_required()
def withdraw_request(request):
    tenant_phone = (request.data.get("tenant_phone") or request.data.get("tenantPhone") or "").strip()
    owner_id = (request.data.get("owner_id") or "").strip()
    owner_phone = (request.data.get("owner_phone") or request.data.get("ownerPhone") or "").strip()
    property_name = (request.data.get("property_name") or request.data.get("propertyName") or "").strip()
   
    lookup_id = owner_id if owner_id else owner_phone
   
    print("--- DB DIAGNOSTIC ---")
    print(f"Targeting: Tenant({tenant_phone}), Owner({lookup_id}), Property({property_name})")
   
    try:
        tenant = Tenent.objects.get(phone=tenant_phone)
        owner = Owners.objects.filter(Q(owner_id=lookup_id) | Q(phone=lookup_id)).order_by('-created_at').first()
        if not owner:
            raise Owners.DoesNotExist
       
        print(f"   [BACKEND] Found Tenant: {tenant.name}, Owner: {owner.name}")
       
        # Filter with flexibility (handles old records with spaces/casing issues)
        query = JoinRequest.objects.filter(
            tenant=tenant,
            owner=owner,
            status__in=['pending', 'accepted', 'allotted']
        )
       
        pre_filter_count = query.count()
        print(f"   [BACKEND] Pre-name-filter matching requests: {pre_filter_count}")
       
        if property_name:
            stripped_name = property_name.strip()
            print(f"   [BACKEND] Applying Name Filter: icontains({stripped_name})")
           
            # Show what is actually in the DB before update
            matches = query.all()
            for m in matches:
                print(f"      Record #{m.id}: Name='{m.property_name}' Status='{m.status}'")
           
            query = query.filter(
                models.Q(property_name__iexact=stripped_name) |
                models.Q(property_name__icontains=stripped_name)
            )
           
        final_query_count = query.count()
        print(f"   [BACKEND] Final matching requests to update: {final_query_count}")
           
        updated_count = query.update(status='withdrawn')
        print(f"   [BACKEND] Successfully updated {updated_count} records to 'withdrawn'")
       
        # ️ NEW: If tenant withdraws, also remove them from allotted beds/units
        # This handles the "if tenant withdraws after approval, remove them from building" request
        deleted_allotments = 0
       
        # 1. Hostel Beds
        db_beds_deleted = TenantBeds.objects.filter(phone=tenant_phone, owner_phone=owner_phone).delete()[0]
        deleted_allotments += db_beds_deleted
       
        # 2. Apartment Units
        db_apts_deleted = ApartmentTenantBeds.objects.filter(phone=tenant_phone, owner_phone=owner_phone).delete()[0]
        deleted_allotments += db_apts_deleted
       
        # 3. Commercial Units
        db_comm_deleted = CommercialTenantBeds.objects.filter(phone=tenant_phone, owner_phone=owner_phone).delete()[0]
        deleted_allotments += db_comm_deleted
       
        if deleted_allotments > 0:
            print(f"   [BACKEND] Cleaned up {deleted_allotments} allotted beds/units for withdrawn tenant.")
 
        # Cleanup: If the tenant has no more active requests, clear their current owner
        has_active = JoinRequest.objects.filter(
            tenant=tenant,
            status__in=['pending', 'accepted', 'allotted']
        ).exists()
       
        if not has_active:
            print("   [BACKEND] No more active requests. Clearing tenant.owner reference.")
            tenant.owner = None
            tenant.save()
        else:
            print("   [BACKEND] Tenant still has other active requests.")
       
        if updated_count > 0:
            # WebSocket: Notify Owner that request was withdrawn
            try:
                channel_layer = get_channel_layer()
                sanitized_phone = owner_phone.replace("@", "_").replace(".", "_")
               
                for group in [f"owner_status_{sanitized_phone}", f"user_notifications_{sanitized_phone}"]:
                    async_to_sync(channel_layer.group_send)(
                        group,
                        {
                            "type": "status_update" if "owner_status" in group else "send_notification",
                            "content": {
                                "type": "request_withdrawn",
                                "message": f"{tenant.name} has withdrawn their request",
                                "tenant_phone": tenant_phone,
                                "id": None,
                                "status": "withdrawn"
                            }
                        }
                    )
            except Exception as e:
                print(f"Owner WS Withdraw Notification Error: {e}")
 
            return Response({
                "message": "Request withdrawn successfully",
                "updated_count": updated_count
            })
        else:
            print("   [BACKEND] WARNING: updated_count is 0. Returning failure message.")
            return Response({
                "message": "No active request found to withdraw",
                "updated_count": 0
            }, status=200)
    except Exception as e:
        return Response({"error": str(e)}, status=400)     

 
# -----------------------------
# Step 1: Send Reset Password phone
# -----------------------------
@api_view(['POST'])
@jwt_required()
def forgot_password(request):
    phone = request.data.get('phone')
    if not phone:
        return Response({"message": "phone is required"}, status=400)
 
    try:
        user = Tenent.objects.get(phone=phone)
    except Tenent.DoesNotExist:
        return Response({"message": "phone not found"}, status=404)
 
    # Generate a unique token
    token = str(uuid.uuid4())
    user.reset_token = token
    user.save()
 
    # Deep link to React Native app
    reset_link = f"https://chatgpt.com/{token}"
 
    # Send phone
    send_mail(
        subject="Password Reset",
        message=f"Click here to reset your password: {reset_link}",
        from_email=settings.EMAIL_HOST_USER,
        recipient_list=[phone],
    )
 
    return Response({"message": "Reset link sent to phone"})
 
 
# -----------------------------
# Step 2: Reset Password
# -----------------------------
@api_view(['POST'])
@jwt_required()
def reset_password(request, token):
    new_password = request.data.get('newPassword')
    if not new_password:
        return Response({"message": "New password is required"}, status=400)
 
    try:
        user = Tenent.objects.get(reset_token=token)
    except Tenent.DoesNotExist:
        return Response({"message": "Invalid or expired token"}, status=400)
 
    # Update password and clear token
    user.set_password(new_password)  # If using Django's AbstractUser, otherwise: user.password = new_password
    user.reset_token = ""
    user.save()
 
    return Response({"message": "Password has been reset successfully"})

@api_view(['DELETE'])
@jwt_required()
def delete_tenent_request(request, phone):
    # Update JoinRequest status so the owner can still see it as 'withdrawn'
    tenantsreq = JoinRequest.objects.filter(tenant__phone=phone)
    tenantsbed = TenantBeds.objects.filter(phone=phone)
    
    if not tenantsreq.exists() and not tenantsbed.exists():
        return Response(
            {"error": "Tenant not found"},
            status=status.HTTP_404_NOT_FOUND
        )
        
    deleted_req_count = tenantsreq.count()
    deleted_bed_count = tenantsbed.count()
 
    # Update JoinRequest status instead of deleting, so the owner sees it as withdrawn
    tenantsreq.update(status='withdrawn')
    
    # Still delete the bed allotment if requested
    tenantsbed.delete()
 
    return Response({
        "message": "Tenant request(s) withdrawn/deleted successfully",
        "join_requests_withdrawn": deleted_req_count,
        "beds_deleted": deleted_bed_count
    }, status=status.HTTP_200_OK)



@api_view(['POST'])
@jwt_required()
def create_payment(request):
    """
    Store payment attempt when user clicks 'I Paid'
    """
    try:
        data = request.data
 
        tenant_phone = data.get('tenant_phone', '').strip().lower()
        tenant_name = data.get('tenant_name')
       
        if not tenant_name:
            tenant_obj = Tenent.objects.filter(phone__iexact=tenant_phone).first()
            if tenant_obj:
                tenant_name = tenant_obj.name
            else:
                tenant_name = tenant_phone.split('@')[0] if tenant_phone else "Unknown"
 
        # Resolve owner phone in case owner_id is passed
        owner_identifier = data.get('owner_phone', '').strip()
        owner = Owners.objects.filter(Q(owner_id=owner_identifier) | Q(phone=owner_identifier)).first()
        actual_owner_id = owner.owner_id if owner else owner_identifier

        payment = Payment.objects.create(
            tenant_phone=tenant_phone,
            tenant_name=tenant_name,
            owner_phone=actual_owner_id,
            owner_name=data.get('owner_name'),
            property_name=data.get('property_name'),
            upi_id=data.get('upi_id'),
            amount=data.get('amount'),
            txn_ref=data.get('txn_ref'),
            status='PENDING'
        )
 
        return Response({
            "message": "Payment recorded successfully",
            "txnRef": payment.txn_ref
        }, status=status.HTTP_201_CREATED)
 
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
 
 
   
@api_view(['GET'])
@jwt_required()
def check_payment_status(request, txn_ref):
    try:
        payment = Payment.objects.get(txn_ref=txn_ref)
 
        return Response({
            "status": payment.status,
            "amount": payment.amount
        })
 
    except Payment.DoesNotExist:
        return Response({"error": "Payment not found"}, status=404)
   
@api_view(['POST'])
@jwt_required()
def update_payment_status(request):
    try:
        txn_ref = request.data.get('txn_ref')
        status_value = request.data.get('status')  # SUCCESS / FAILED
 
        try:
            payment = Payment.objects.get(txn_ref=txn_ref)
            payment.status = status_value
            payment.save()
        except Payment.DoesNotExist:
            # Check if it's a virtual payment (starts with PEND-)
            if txn_ref and txn_ref.startswith("PEND-"):
                try:
                    req_id = txn_ref.split("-")[1]
                    req = JoinRequest.objects.get(id=req_id)
                   
                    # Create the real payment record now
                    # We need to find the rent again
                    tenant_phone = req.tenant.phone
                    tenant_phone = (req.tenant.phone or "").strip()
                    owner_phone = req.owner.phone
                    rent_amount = 0
                   
                    for table in [TenantBeds, ApartmentTenantBeds, CommercialTenantBeds]:
                        record = table.objects.filter(
                            (Q(phone__iexact=tenant_phone) | Q(phone__iexact=tenant_phone)),
                            owner_phone__iexact=owner_phone
                        ).order_by('-id').first()
                        if record and record.rent:
                            rent_amount = record.rent
                            break
                   
                    payment = Payment.objects.create(
                        tenant_phone=tenant_phone,
                        tenant_name=req.tenant.name or tenant_phone.split('@')[0],
                        owner_phone=owner_phone,
                        owner_name=req.owner.name,
                        property_name=req.property_name,
                        upi_id="",
                        amount=rent_amount,
                        txn_ref=txn_ref,
                        status=status_value
                    )
                except Exception as ex:
                    return Response({"error": f"Could not create payment from virtual record: {str(ex)}"}, status=400)
            else:
                return Response({"error": "Payment not found"}, status=404)
 
        # If payment is SUCCESS, send notification
        if status_value == 'SUCCESS':
            # Create Notification in DB
            notification = Notification.objects.create(
                recipient_phone=payment.owner_phone,
                title="Rent Payment Received",
                message=f"{payment.tenant_name} has paid rent ₹{payment.amount} successfully.",
                type="PAYMENT",
                related_id=payment.id
            )
 
            # Send WebSocket notification to owner
            try:
                channel_layer = get_channel_layer()
                sanitized_phone = payment.owner_phone.replace("@", "_").replace(".", "_")
               
                for group in [f"owner_status_{sanitized_phone}", f"user_notifications_{sanitized_phone}"]:
                    async_to_sync(channel_layer.group_send)(
                        group,
                        {
                            "type": "status_update" if "owner_status" in group else "send_notification",
                            "content": {
                                "id": notification.id,
                                "type": "PAYMENT",
                                "title": notification.title,
                                "message": notification.message,
                                "is_read": notification.is_read,
                                "created_at": notification.created_at.isoformat(),
                                "related_id": payment.id,
                                "amount": payment.amount,
                                "tenant_name": payment.tenant_name
                            }
                        }
                    )
            except Exception as e:
                print(f"WS Payment Notification Error: {e}")
               
        # Also notify the Tenant about the payment status update
        if status_value in ['SUCCESS', 'FAILED']:
            try:
                channel_layer = get_channel_layer()
                sanitized_tenant = payment.tenant_phone.replace("+", "").replace("@", "_").replace(".", "_")
                msg_text = f"Your payment for {payment.property_name} has been verified." if status_value == 'SUCCESS' else f"Your payment for {payment.property_name} was declined."
               
                async_to_sync(channel_layer.group_send)(
                    f"user_notifications_{sanitized_tenant}",
                    {
                        "type": "send_notification",
                        "content": {
                            "type": "PAYMENT_VERIFIED",
                            "message": msg_text,
                            "status": status_value
                        }
                    }
                )
            except Exception as e:
                print(f"WS Tenant Payment Notification Error: {e}")
 
        return Response({"message": "Payment status updated"})
 
    except Exception as e:
        return Response({"error": str(e)}, status=500)

        
@api_view(['GET'])
@jwt_required()
def get_owner_payments(request, phone):
    """
    Fetch all payments and active tenants for an owner.
    """
    try:
        owner = Owners.objects.filter(owner_id=phone).first()
        if owner:
            payments = list(Payment.objects.filter(
                owner_phone__iexact=owner.owner_id
            ).order_by('-created_at'))
        else:
            payments = list(Payment.objects.filter(owner_phone__iexact=phone).order_by('-created_at'))
       
        # 2. Get active tenants (accepted or allotted)
        active_requests = JoinRequest.objects.filter(
            owner=owner,
            status__in=['accepted', 'allotted']
        )
       
        # Track which tenants already have a payment record (to avoid duplicates)
        paid_tenant_phones = {p.tenant_phone.lower() for p in payments if p.tenant_phone}
       
        # 3. Add "virtual" pending records for active tenants who haven't initiated a payment
        for req in active_requests:
            try:
                if not req.tenant or not req.tenant.phone:
                    continue
                tenant_phone = req.tenant.phone.lower()
                if tenant_phone not in paid_tenant_phones:
                    # We need to find the rent for this tenant
                    rent_amount = 0
                    tenant_phone = (req.tenant.phone or "").strip()
                   
                    # Check tables for rent
                    for table in [TenantBeds, ApartmentTenantBeds, CommercialTenantBeds]:
                        record = table.objects.filter(
                            (Q(phone__iexact=tenant_phone) | Q(phone__iexact=tenant_phone)),
                            Q(owner_phone__iexact=(owner.owner_id if owner else phone)) | Q(owner_phone__iexact=(owner.phone if owner else phone))
                        ).order_by('-id').first()
                        if record and record.rent:
                            rent_amount = float(record.rent)
                            break
                   
                    try:
                        owner_name = req.owner.name if (req.owner and req.owner.name) else "Owner"
                    except Exception:
                        owner_name = "Owner"
                   
                    created_at = req.created_at if req.created_at else timezone.now()
                   
                    # Create a synthetic Payment object (not saved to DB)
                    virtual_payment = Payment(
                        tenant_phone=req.tenant.phone,
                        tenant_name=req.tenant.name or tenant_phone.split('@')[0],
                        owner_phone=phone,
                        owner_name=owner_name,
                        property_name=req.property_name or "Property",
                        upi_id="",
                        amount=rent_amount,
                        txn_ref=f"PEND-{req.id}", # Synthetic ref
                        status='PENDING',
                        created_at=created_at # Use request date or now
                    )
                    payments.append(virtual_payment)
            except Exception as loop_err:
                print(f"Error building virtual payment for req {getattr(req, 'id', 'unknown')}: {loop_err}")
       
        serializer = PaymentSerializer(payments, many=True)
        response_data = serializer.data
       
        # 4. Attach screenshot URLs
        for p_data in response_data:
            # First check if the Payment object itself has a screenshot (new behavior)
            payment_obj = Payment.objects.filter(txn_ref=p_data.get('txn_ref')).first()
            if payment_obj and payment_obj.payment_screenshot:
                try:
                    p_data['payment_screenshot'] = request.build_absolute_uri(payment_obj.payment_screenshot.url)
                    continue
                except Exception as p_img_err:
                    print("Payment screenshot URL generation failed:", p_img_err)
                    p_data['payment_screenshot'] = None
 
            # Fallback: check screenshot URLs from tenant tables (old behavior)
            # ONLY fallback if it's not a cash payment attempt
            if p_data.get('txn_ref') and (p_data.get('txn_ref').startswith('CASH-') or p_data.get('txn_ref').startswith('PEND-')):
                p_data['payment_screenshot'] = None
                continue
 
            tenant_phone = p_data.get('tenant_phone')
            if not tenant_phone:
                continue
               
            screenshot_url = None
            for table in [TenantBeds, ApartmentTenantBeds, CommercialTenantBeds]:
                record = table.objects.filter(phone__iexact=tenant_phone, owner_phone__iexact=phone).order_by('-id').first()
                if record and record.payment_screenshot:
                    try:
                        screenshot_url = request.build_absolute_uri(record.payment_screenshot.url)
                        break
                    except Exception:
                        pass
           
            p_data['payment_screenshot'] = screenshot_url
 
        return Response(response_data)
       
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
 
    




@api_view(['POST'])
@jwt_required()
def upload_payment_screenshot(request):
    try:
        phone = request.data.get('phone', '').strip().lower()
        screenshot = request.FILES.get('payment_screenshot')
        txn_ref = request.data.get('txn_ref')
 
        if not phone:
            return Response({"error": "phone is required"}, status=status.HTTP_400_BAD_REQUEST)
 
        if not screenshot:
            return Response({"error": "Screenshot is required"}, status=status.HTTP_400_BAD_REQUEST)
 
        # 1. Try to find/create a Payment record
        payment = None
        if txn_ref:
            payment = Payment.objects.filter(txn_ref=txn_ref).first()
       
        if not payment:
            payment = Payment.objects.filter(tenant_phone__iexact=phone, status='PENDING').order_by('-created_at').first()

        if not payment:
            # Create a new payment record if one didn't exist
            tenant_obj = Tenent.objects.filter(phone__iexact=phone).first()
            if tenant_obj:
                latest_req = JoinRequest.objects.filter(tenant=tenant_obj, status__in=['accepted', 'allotted']).order_by('-created_at').first()
                if latest_req:
                    payment = Payment.objects.create(
                        tenant_phone=phone,
                        tenant_name=tenant_obj.name,
                        owner_phone=latest_req.owner.owner_id,
                        owner_name=latest_req.owner.name,
                        property_name=latest_req.property_name,
                        amount=request.data.get('amount', 0),
                        txn_ref=txn_ref or f"PROOF-{int(timezone.now().timestamp())}",
                        status='PENDING'
                    )
                else:
                    # Fallback for offline tenants who don't have JoinRequest
                    allotment = None
                    prop_type = None
                    allotment = TenantBeds.objects.filter(phone__iexact=phone).first()
                    if allotment:
                        prop_type = "hostel"
                    else:
                        allotment = ApartmentTenantBeds.objects.filter(phone__iexact=phone).first()
                        if allotment:
                            prop_type = "apartment"
                        else:
                            allotment = CommercialTenantBeds.objects.filter(phone__iexact=phone).first()
                            if allotment:
                                prop_type = "commercial"
                    if allotment:
                        owner_val = allotment.owner_phone
                        owner = Owners.objects.filter(Q(owner_id=owner_val) | Q(phone=owner_val)).first()
                        if owner:
                            property_name = "Property"
                            if prop_type == "hostel":
                                h = StayHostelDetails.objects.filter(owner=owner).first()
                                if h:
                                    property_name = h.hostelName
                            elif prop_type == "apartment":
                                a = ApartmentStayDetails.objects.filter(owner=owner).first()
                                if a:
                                    property_name = a.apartmentName
                            elif prop_type == "commercial":
                                c = CommericialDetails.objects.filter(owner=owner).first()
                                if c:
                                    property_name = c.commercialName
                            payment = Payment.objects.create(
                                tenant_phone=phone,
                                tenant_name=tenant_obj.name,
                                owner_phone=owner.owner_id,
                                owner_name=owner.name,
                                property_name=property_name,
                                amount=request.data.get('amount', allotment.rent),
                                txn_ref=txn_ref or f"PROOF-{int(timezone.now().timestamp())}",
                                status='PENDING'
                            )
 
        # 2. Save screenshot to Payment record
        if payment:
            payment.payment_screenshot = screenshot
            if request.data.get('amount'):
                payment.amount = request.data.get('amount')
            payment.save()
           
            # 3. Also sync with Bed tables for backward compatibility
            for table in [TenantBeds, ApartmentTenantBeds, CommercialTenantBeds]:
                table.objects.filter(phone__iexact=phone).update(payment_screenshot=screenshot)
 
            # Create Notification and send WS event
            try:
                owner_phone = payment.owner_phone
                notification = Notification.objects.create(
                    recipient_phone=owner_phone,
                    title="Payment Screenshot Uploaded",
                    message=f"{payment.tenant_name} has uploaded a payment screenshot for ₹{payment.amount}.",
                    type="PAYMENT",
                    related_id=payment.id
                )
 
                channel_layer = get_channel_layer()
                owner = Owners.objects.filter(Q(owner_id=owner_phone) | Q(phone=owner_phone)).first()
                sanitized_phone = owner.owner_id if owner and owner.owner_id else owner_phone.replace("@", "_").replace(".", "_")
               
                for group in [f"owner_status_{sanitized_phone}", f"user_notifications_{sanitized_phone}"]:
                    async_to_sync(channel_layer.group_send)(
                        group,
                        {
                            "type": "status_update" if "owner_status" in group else "send_notification",
                            "content": {
                                "id": notification.id,
                                "type": "PAYMENT",
                                "title": notification.title,
                                "message": notification.message,
                                "is_read": notification.is_read,
                                "created_at": notification.created_at.isoformat(),
                                "related_id": payment.id
                            }
                        }
                    )
            except Exception as ws_err:
                print("WS Error (Screenshot):", ws_err)
 
            return Response({
                "message": "Screenshot uploaded and payment record updated",
                "image_url": request.build_absolute_uri(payment.payment_screenshot.url),
                "txn_ref": payment.txn_ref
            }, status=status.HTTP_200_OK)
 
        return Response({"error": "No active request found to attach payment to."}, status=400)
 
    except Exception as e:
        print("Upload Screenshot Error:", e)
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
 
@api_view(['POST'])
@jwt_required()
def cash_payment(request):
    """
    Tenant confirms they have paid cash.
    """
    try:
        phone = request.data.get('phone', '').strip().lower()
        amount = request.data.get('amount')
        property_name = request.data.get('propertyName')
        description = request.data.get('description', '')
 
        if not phone:
            return Response({"error": "phone is required"}, status=status.HTTP_400_BAD_REQUEST)
 
        #  PREVENT DUPLICATE PAYMENTS FOR THE SAME MONTH
        current_month = timezone.now().month
        current_year = timezone.now().year
       
        existing_payment = Payment.objects.filter(
            tenant_phone__iexact=phone,
            status='SUCCESS',
            created_at__year=current_year,
            created_at__month=current_month
        ).exists()
 
        if existing_payment:
            return Response({
                "error": "A payment for this month is already completed."
            }, status=status.HTTP_400_BAD_REQUEST)
 
        # Find or create a payment record
        payment = Payment.objects.filter(
            tenant_phone__iexact=phone,
            status='PENDING'
        ).order_by('-created_at').first()
 
        if not payment:
            # Try to find their details to create a record
            tenant_obj = Tenent.objects.filter(phone__iexact=phone).first()
            if not tenant_obj:
                return Response({"error": "Tenant not found"}, status=status.HTTP_404_NOT_FOUND)
           
            latest_req = JoinRequest.objects.filter(
                tenant__phone__iexact=phone,
                status__in=['accepted', 'allotted']
            ).order_by('-id').first()
 
            if not latest_req:
                return Response({"error": "No active property found for this tenant"}, status=status.HTTP_404_NOT_FOUND)
 
            payment = Payment.objects.create(
                tenant_phone=phone,
                tenant_name=tenant_obj.name or phone.split('@')[0],
                owner_phone=latest_req.owner.owner_id,
                owner_name=latest_req.owner.name,
                property_name=latest_req.property_name,
                amount=amount or 0,
                txn_ref=f"CASH-{int(timezone.now().timestamp())}",
                status='PENDING',
                description=description
            )
        # ️ CLEAR OLD SCREENSHOTS from allotment records
        # This prevents the owner dashboard from showing a previous month's UPI
        # screenshot for a new cash payment attempt.
        for table in [TenantBeds, ApartmentTenantBeds, CommercialTenantBeds]:
            table.objects.filter(phone__iexact=phone).update(payment_screenshot=None)
 
        # Clear screenshot on the payment record itself if it exists (just in case)
        if payment:
            payment.payment_screenshot = None
            payment.description = description
            if amount:
                payment.amount = amount
            if not payment.txn_ref.startswith('CASH-'):
                payment.txn_ref = f"CASH-{int(timezone.now().timestamp())}"
            payment.save()
 
            # Create Notification and send WS event
            try:
                owner_phone = payment.owner_phone
                notification = Notification.objects.create(
                    recipient_phone=owner_phone,
                    title="Cash Payment Requested",
                    message=f"{payment.tenant_name} has requested to pay ₹{payment.amount} in cash.",
                    type="PAYMENT",
                    related_id=payment.id
                )
 
                channel_layer = get_channel_layer()
                owner = Owners.objects.filter(Q(owner_id=owner_phone) | Q(phone=owner_phone)).first()
                sanitized_phone = owner.owner_id if owner and owner.owner_id else owner_phone.replace("@", "_").replace(".", "_")
               
                for group in [f"owner_status_{sanitized_phone}", f"user_notifications_{sanitized_phone}"]:
                    async_to_sync(channel_layer.group_send)(
                        group,
                        {
                            "type": "status_update" if "owner_status" in group else "send_notification",
                            "content": {
                                "id": notification.id,
                                "type": "PAYMENT",
                                "title": notification.title,
                                "message": notification.message,
                                "is_read": notification.is_read,
                                "created_at": notification.created_at.isoformat(),
                                "related_id": payment.id
                            }
                        }
                    )
            except Exception as ws_err:
                print("WS Error (Cash):", ws_err)
 
        return Response({"message": "Cash payment confirmation sent"}, status=status.HTTP_200_OK)
 
    except Exception as e:
        print("Cash Payment Error:", e)
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
 

@api_view(['POST'])
@jwt_required()
def send_owner_notification(request):
    """
    Mock notification endpoint for owners.
    """
    try:
        print(f"NOTIFICATION TO OWNER ({request.data.get('ownerPhone')}): {request.data.get('title')} - {request.data.get('message')}")
        return Response({"message": "Notification sent to owner"}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@jwt_required()
def send_tenant_notification(request):
    """
    Saves and sends notification to tenant (Reminders, Payment Requests).
    """
    try:
        tenant_phone = request.data.get('tenantPhone')
        title = request.data.get('title')
        message = request.data.get('message')
        n_type = request.data.get('type', 'REMINDER')
        amount = request.data.get('amount')
       
        # Save to database
        notification = Notification.objects.create(
            recipient_phone=tenant_phone,
            title=title,
            message=message,
            type=n_type
        )
       
        # In a real app, integrate with FCM/Push notifications here
        print(f"NOTIFICATION SAVED & SENT TO TENANT ({tenant_phone}): {title} - {message}")
       
        # Send WebSocket update if possible
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            sanitized_phone = tenant_phone.replace("+", "").replace(" ", "")
           
            async_to_sync(channel_layer.group_send)(
                f"user_notifications_{sanitized_phone}",
                {
                    "type": "send_notification",
                    "content": {
                        "id": notification.id,
                        "title": notification.title,
                        "message": notification.message,
                        "type": notification.type,
                        "created_at": notification.created_at.isoformat(),
                    }
                }
            )
        except Exception as ws_err:
            print(f"WS Error in send_tenant_notification: {ws_err}")
 
        return Response({"message": "Notification sent successfully", "id": notification.id}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
 
 
 



@api_view(['GET'])
@jwt_required()
def get_owner_expenses(request, phone):
    """
    Returns owner expenses from the database.
    """
    try:
        if phone:
            phone = phone.strip()
        owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone__iexact=phone)).first()
        if not owner:
            return Response({"error": "Owner not found"}, status=404)
            
        expenses = Expense.objects.filter(owner=owner).order_by('-date')
        serializer = ExpenseSerializer(expenses, many=True)
        return Response({"expenses": serializer.data}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@jwt_required()
def add_expense(request):
    """
    Creates a new expense record for an owner.
    """
    try:
        phone = request.data.get('owner_phone') or request.data.get('owner_email')
        if phone:
            phone = phone.strip()
        print(f"ADD EXPENSE PHONE: '{phone}'")
        owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone__iexact=phone)).first()
        if not owner:
            return Response({"error": f"Owner not found for phone/id: {phone}"}, status=404)
            
        data = request.data.copy()
        data['owner'] = owner.pk
        
        serializer = ExpenseSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@jwt_required()
def get_tenant_payment_history(request, phone):
    """
    Returns the complete payment history for a tenant.
    """
    try:
        payments = Payment.objects.filter(tenant_phone__iexact=phone).order_by('-created_at')
        serializer = PaymentSerializer(payments, many=True)
        response_data = serializer.data

        # Attach full screenshot URLs
        for p_data in response_data:
            payment_obj = Payment.objects.filter(txn_ref=p_data.get('txn_ref')).first()
            if payment_obj and payment_obj.payment_screenshot:
                try:
                    p_data['payment_screenshot'] = request.build_absolute_uri(payment_obj.payment_screenshot.url)
                except:
                    p_data['payment_screenshot'] = None
            else:
                p_data['payment_screenshot'] = None

        return Response(response_data, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
@api_view(['GET'])
@jwt_required()
def get_owner_tenants(request, phone):
    """
    Returns all tenants assigned to an owner across all property types.
    """
    try:
        tenants_list = []
        
        # 1. Hostel Tenants
        hostel_tenants = TenantBeds.objects.filter(owner_phone__iexact=phone)
        for t in hostel_tenants:
            tenants_list.append({
                "id": t.id,
                "name": t.name,
                "phone": t.phone,
                "room": f"Room {t.roomno}",
                "property_type": "Hostel",
                "rent": t.rent,
                "checkIn": t.checkIn
            })
            
        # 2. Apartment Tenants
        apartment_tenants = ApartmentTenantBeds.objects.filter(owner_phone__iexact=phone)
        for t in apartment_tenants:
            tenants_list.append({
                "id": t.id,
                "name": t.name,
                "phone": t.phone,
                "room": f"Flat {t.flatno}",
                "property_type": "Apartment",
                "rent": t.rent,
                "checkIn": t.checkIn
            })
            
        # 3. Commercial Tenants
        commercial_tenants = CommercialTenantBeds.objects.filter(owner_phone__iexact=phone)
        for t in commercial_tenants:
            tenants_list.append({
                "id": t.id,
                "name": t.name,
                "phone": t.phone,
                "room": f"Section {t.sectionNo}",
                "property_type": "Commercial",
                "rent": t.rent,
                "checkIn": t.checkIn
            })
            
        return Response({"tenants": tenants_list}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@jwt_required()
def get_notifications(request, phone):
    """
    Get all notifications for a user (owner/tenant).
    """
    try:
        owner = Owners.objects.filter(owner_id=phone).first()
        if owner:
            notifications = Notification.objects.filter(
                recipient_phone__iexact=owner.owner_id
            ).order_by('-created_at')
        else:
            notifications = Notification.objects.filter(
                recipient_phone__iexact=phone
            ).order_by('-created_at')
        
        data = []
        for n in notifications:
            data.append({
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "is_read": n.is_read,
                "created_at": n.created_at,
                "related_id": n.related_id
            })
        
        unread_count = notifications.filter(is_read=False).count()
        
        return Response({
            "notifications": data,
            "unread_count": unread_count
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['PATCH'])
@jwt_required()
def mark_notification_read(request, notification_id):
    """
    Mark a single notification as read.
    """
    try:
        notification = Notification.objects.get(id=notification_id)
        notification.is_read = True
        notification.save()
        
        return Response({"message": "Notification marked as read"}, status=status.HTTP_200_OK)
    except Notification.DoesNotExist:
        return Response({"error": "Notification not found"}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['PATCH'])
@jwt_required()
def mark_all_notifications_read(request, phone):
    """
    Mark all notifications for a user as read.
    """
    try:
        owner = Owners.objects.filter(owner_id=phone).first()
        target_phone = owner.owner_id if owner else phone
        notifications = Notification.objects.filter(
            recipient_phone__iexact=target_phone,
            is_read=False
        )
        notifications.update(is_read=True)
        
        return Response({"message": "All notifications marked as read"}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
def send_otp(request):
    mobile = request.data.get('mobile')
    if not mobile:
        return Response({"error": "Mobile number is required"}, status=status.HTTP_400_BAD_REQUEST)
    
    # Prepend country code if it's exactly 10 digits
    if len(mobile) == 10 and mobile.isdigit():
        mobile = f"91{mobile}"

    url = "https://control.msg91.com/api/v5/otp"
    headers = {
        "authkey": "516789AG6B0QoXv6a06bb0cP1",
        "Content-Type": "application/json"
    }
    payload = {
        "mobile": mobile,
        "template_id": "6a06b98a7a07537c320c8072"
    }

    try:
        response = requests.post(url, headers=headers, json=payload)
        response_data = response.json()
        print("MSG91 SEND OTP RESPONSE:", response_data)
        if response_data.get('type') == 'success':
            return Response({"message": "OTP sent successfully", "data": response_data}, status=status.HTTP_200_OK)
        else:
            print("WARNING: MSG91 OTP send failed. Triggering development bypass.")
            return Response({
                "message": "OTP sent successfully (Development Bypass Active - Use OTP: 123456)",
                "data": {"type": "success", "message": "Development bypass triggered"},
                "bypass": True
            }, status=status.HTTP_200_OK)
    except Exception as e:
        print(f"Exception during OTP send: {e}. Triggering development bypass.")
        return Response({
            "message": "OTP sent successfully (Development Bypass Active - Use OTP: 123456)",
            "data": {"type": "success", "message": "Development bypass triggered"},
            "bypass": True
        }, status=status.HTTP_200_OK)


@api_view(['POST'])
def verify_otp(request):
    mobile = request.data.get('mobile')
    otp = request.data.get('otp')

    if not mobile or not otp:
        return Response({"error": "Mobile number and OTP are required"}, status=status.HTTP_400_BAD_REQUEST)

    if len(mobile) == 10 and mobile.isdigit():
        mobile = f"91{mobile}"

    # Bypass logic: if otp is 123456 or 1234, always succeed
    if str(otp) in ["123456", "1234"]:
        print("OTP verified successfully via development bypass.")
        return Response({"message": "OTP verified successfully"}, status=status.HTTP_200_OK)

    url = "https://control.msg91.com/api/v5/otp/verify"
    params = {
        "mobile": mobile,
        "otp": otp
    }
    headers = {
        "authkey": "516789AG6B0QoXv6a06bb0cP1"
    }

    try:
        response = requests.get(url, headers=headers, params=params)
        response_data = response.json()
        print("MSG91 VERIFY OTP RESPONSE:", response_data)
        
        if response_data.get('type') == 'success' or response_data.get('message') == 'OTP verified success' or response_data.get('message') == 'OTP verified':
            return Response({"message": "OTP verified successfully"}, status=status.HTTP_200_OK)
        else:
            return Response({"error": "Invalid OTP", "details": response_data}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": "Error verifying OTP", "details": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Owners


# @api_view(['GET'])
# def check_user(request, phone):

#     try:

#         user_exists = Owners.objects.filter(
#             phone=phone
#         ).exists()

#         user = Owners.objects.filter(
#             phone=phone
#         ).first()

#         return Response({
#             "exists": user_exists,
#             "user": {
#                 "id": user.id,
#                 "name": user.name,
#                 "phone": user.phone,
#                 "phone": user.phone,
#             } if user else None
#         })

#     except Exception as e:

#         return Response({
#             "error": str(e)
#         }, status=500)
from rest_framework.decorators import api_view
from rest_framework.response import Response



@api_view(['GET'])
def check_user(request, phone):
    try:
        if phone and len(phone) == 10:
            phone = phone[-10:]  # Ensure only last 10 digits are used for lookup
        user = Tenent.objects.filter(phone=phone).first()
        if user:
            token = generate_jwt_token(user_id=user.id, role='tenant', phone=user.phone)
            return Response({
                "exists": True,
                "token": token,
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "phone": user.phone,
                }
            })
        return Response({
            "exists": False,
            "user": None
        })
    except Exception as e:
        return Response({
            "exists": False,
            "error": str(e)
        }, status=500)

@api_view(['GET'])
def check_owner(request, phone):
    try:
        if phone and len(phone) == 10:
            phone = phone[-10:]
        user = Owners.objects.filter(phone=phone).first()
        if user:
            if user.status == 'pending':
                return Response({
                    "exists": True,
                    "error": "Your account is pending approval by admin."
                })
            elif user.status == 'suspend':
                return Response({
                    "exists": True,
                    "error": "Your account has been suspended by admin."
                })

            token = generate_jwt_token(user_id=user.pk, role='owner', phone=user.phone)
            return Response({
                "exists": True,
                "token": token,
                "user": {
                    "id": user.pk,
                    "name": user.name,
                    "phone": user.phone,
                }
            })
        return Response({
            "exists": False,
            "user": None
        })
    except Exception as e:
        return Response({
            "exists": False,
            "error": str(e)
        }, status=500)


@api_view(['GET'])
def get_owner_accounts(request, phone):
    try:
        owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone=phone)).first()
        actual_phone = owner.phone if owner else phone
        
        owners = Owners.objects.filter(phone=actual_phone).order_by('created_at')
        data = []
        for o in owners:
            p_type = "N/A"
            p_name = "N/A"
            hostel = StayHostelDetails.objects.filter(owner=o).first()
            if hostel:
                p_type = "Hostel"
                p_name = hostel.hostelName
            else:
                apartment = ApartmentStayDetails.objects.filter(owner=o).first()
                if apartment:
                    p_type = "Apartment"
                    p_name = apartment.apartmentName
                else:
                    commercial = CommericialDetails.objects.filter(owner=o).first()
                    if commercial:
                        p_type = "Commercial"
                        p_name = commercial.commercialName
            
            data.append({
                "id": o.pk,
                "name": o.name,
                "phone": o.phone,
                "property_type": p_type,
                "property_name": p_name,
                "status": o.status
            })
        return Response({"accounts": data}, status=200)
    except Exception as e:
        return Response({"error": str(e)}, status=500)




@api_view(['PATCH'])
@jwt_required()
def update_building_layout(request, phone):
    """
    Updates the building layout (floors, rooms/flats/sections) for an owner's property.
    """
    try:
        from django.db import transaction
        owner = Owners.objects.filter(Q(owner_id=phone) | Q(phone__iexact=phone)).first()
        if not owner:
            return Response({"error": "Owner not found"}, status=404)

        building_layout = request.data.get("building_layout")
        stay_type = request.data.get("stay_type")

        if not building_layout or not stay_type:
            return Response({"error": "Missing building_layout or stay_type"}, status=400)

        try:
            if isinstance(building_layout, str):
                layout = json.loads(building_layout)
            else:
                layout = building_layout
        except json.JSONDecodeError:
            return Response({"error": "Invalid building_layout JSON"}, status=400)

        with transaction.atomic():
            if stay_type == "hostel":
                property_obj = StayHostelDetails.objects.filter(owner=owner).first()
                if not property_obj:
                    return Response({"error": "Property not found"}, status=404)
                
                HostelFloorRoom.objects.filter(owner=owner).delete()
                
                for floor_data in layout:
                    floor_no = floor_data.get("floorNo")
                    for room in floor_data.get("rooms", []):
                        HostelFloorRoom.objects.create(
                            owner=owner,
                            hostel=property_obj,
                            floor=floor_no,
                            roomNo=room.get("roomNo"),
                            sharing=room.get("beds")
                        )

            elif stay_type == "apartment":
                property_obj = ApartmentStayDetails.objects.filter(owner=owner).first()
                if not property_obj:
                    return Response({"error": "Property not found"}, status=404)
                
                ApartmentFloorUnit.objects.filter(owner=owner).delete()
                
                for floor_data in layout:
                    floor_no = floor_data.get("floorNo")
                    for flat in floor_data.get("flats", []):
                        ApartmentFloorUnit.objects.create(
                            owner=owner,
                            apartment=property_obj,
                            floor=floor_no,
                            flatNo=flat.get("flatNo"),
                            bhk=flat.get("bhk")
                        )

            elif stay_type == "commercial":
                property_obj = CommericialDetails.objects.filter(owner=owner).first()
                if not property_obj:
                    return Response({"error": "Property not found"}, status=404)
                
                CommercialFloor.objects.filter(owner=owner).delete()
                
                for floor_data in layout:
                    floor_no = floor_data.get("floorNo")
                    for section in floor_data.get("sections", []):
                        CommercialFloor.objects.create(
                            owner=owner,
                            commercial_property=property_obj,
                            floorNo=floor_no,
                            sectionNo=section.get("sectionNo"),
                            area_sqft=section.get("area_sqft")
                        )
            else:
                return Response({"error": "Invalid stay_type"}, status=400)

        return Response({"message": "Building layout updated successfully"}, status=200)
    except Exception as e:
        return Response({"error": str(e)}, status=500)


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
@jwt_required()
def tenant_submit_verification(request):
    """
    Submits identity verification (Aadhaar ID and screenshot upload) for a tenant.
    """
    print("--- [SUBMIT VERIFICATION DEBUG] ---")
    print("RAW request.data:", dict(request.data))
    print("RAW request.FILES:", dict(request.FILES))
    
    phone = request.data.get("phone")
    aadhar_id = request.data.get("aadhar_id")
    aadhar_image = request.FILES.get("aadhar_image")
    aadhar_back_image = request.FILES.get("aadhar_back_image")
    payment_screenshot = request.FILES.get("payment_screenshot")
    selfie = request.FILES.get("selfie")
    
    print(f"Parsed fields -> Phone: '{phone}', Aadhar ID: '{aadhar_id}', Aadhar Image: '{aadhar_image}', Aadhar Back: '{aadhar_back_image}', Payment Screenshot: '{payment_screenshot}'")
    
    if not phone or not aadhar_id or not aadhar_image or not aadhar_back_image:
        print("  [DEBUG] Failed: Missing fields")
        return Response({"error": "All fields (Aadhar ID, Front and Back images) are required."}, status=400)
        
    # Validate Aadhar ID is 12 digits
    aadhar_id = aadhar_id.strip()
    if not aadhar_id.isdigit() or len(aadhar_id) != 12:
        print(f"  [DEBUG] Failed: Aadhar ID format invalid ('{aadhar_id}')")
        return Response({"error": "Aadhar ID must be exactly 12 numeric digits."}, status=400)
        
    # Validate Aadhar ID uniqueness
    existing_tenant = Tenent.objects.filter(aadhar_id=aadhar_id).exclude(phone=phone).first()
    if existing_tenant:
        print(f"  [DEBUG] Failed: Aadhar ID '{aadhar_id}' already exists for tenant {existing_tenant.phone}")
        return Response({"error": "This Aadhar ID is already registered to another user."}, status=400)
        
    try:
        tenant = Tenent.objects.get(phone=phone)
        tenant.aadhar_id = aadhar_id
        tenant.aadhar_image = aadhar_image
        tenant.aadhar_back_image = aadhar_back_image
        if payment_screenshot:
            tenant.payment_screenshot = payment_screenshot
        if selfie:
            tenant.selfie = selfie
        tenant.is_vacant = False  # Set is_vacant to False immediately upon joining!
        tenant.save()
        
        # ALSO update the JoinRequest status to 'completed'
        join_req = JoinRequest.objects.filter(tenant=tenant, status__in=['accepted', 'allotted']).order_by('-created_at').first()
        if join_req:
            join_req.status = 'completed'
            join_req.save()
            print(f"  [DEBUG] Success: Updated JoinRequest {join_req.id} status to completed")
            
        print(f"  [DEBUG] Success: Saved details and checked-in tenant {phone}")
        return Response({"message": "Verification submitted successfully!"}, status=200)
    except Tenent.DoesNotExist:
        print(f"  [DEBUG] Failed: Tenant {phone} not found")
        return Response({"error": "Tenant not found."}, status=404)
    except Exception as e:
        print(f"  [DEBUG] Failed with exception: {str(e)}")
        return Response({"error": str(e)}, status=500)


@api_view(['GET'])
@jwt_required()
def get_co_residents(request, phone):
    """
    Returns all tenants sharing the same property/owner.
    """
    try:
        tenant = Tenent.objects.filter(phone=phone).first()
        if not tenant or not tenant.owner:
            return Response({"co_residents": []}, status=200)
            
        owner = tenant.owner
        co_residents = []
        
        # 1. Hostel Tenants
        hostel_beds = TenantBeds.objects.filter(owner_phone=owner.owner_id).exclude(phone__iexact=phone)
        for t in hostel_beds:
            co_residents.append({
                "id": t.id,
                "name": t.name,
                "phone": t.phone,
                "room": f"Room {t.roomno}",
                "property_type": "Hostel",
                "rent": t.rent,
                "checkIn": t.checkIn
            })
            
        # 2. Apartment Tenants
        apt_beds = ApartmentTenantBeds.objects.filter(owner_phone=owner.owner_id).exclude(phone__iexact=phone)
        for t in apt_beds:
            co_residents.append({
                "id": t.id,
                "name": t.name,
                "phone": t.phone,
                "room": f"Flat {t.flatno}",
                "property_type": "Apartment",
                "rent": t.rent,
                "checkIn": t.checkIn
            })
            
        # 3. Commercial Tenants
        comm_beds = CommercialTenantBeds.objects.filter(owner_phone=owner.owner_id).exclude(phone__iexact=phone)
        for t in comm_beds:
            co_residents.append({
                "id": t.id,
                "name": t.name,
                "phone": t.phone,
                "room": f"Section {t.sectionNo}",
                "property_type": "Commercial",
                "rent": t.rent,
                "checkIn": t.checkIn
            })
            
        return Response({"co_residents": co_residents}, status=200)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

